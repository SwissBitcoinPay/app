import { bytesToHex } from "@noble/hashes/utils.js";

import * as assistantsConfig from "@/config/assistants";
import * as paymentLinks from "@/config/payment-links";
import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import {
  createAssistant,
  createIntegration,
  loadAssistants,
  removeAssistant,
  setAssistantExport,
  syncTeamChannels
} from "@/features/team/owner";
import { deviceFormat } from "@/features/team/export-grants";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import {
  exportDecisionAddress,
  exportGrantFilter,
  exportGrantOf,
  grantedKeys,
  type ExportKeys
} from "@/lib/assistant/export-grant";
import { deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import * as deviceLocale from "@/lib/locale/device";
import { queryRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { RelayRefusal } from "@/lib/nostr/relay-errors";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  derivePaymentRateKeys,
  deriveRegistryReader,
  deriveTeamKeys,
  deriveWalletSendKeys,
  integrationSecretKey,
  usableTeamKeys
} from "@/lib/team/keys";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's grants of the transactions' export to its assistants (export-grants.ts): allowed,
 * the assistant reads with its secret key alone the reading keys of the account and of every seat;
 * withdrawn, or removed, nothing; kept in step with the team; never decided on too few relays nor
 * written over a newer app's.
 */

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const team = deriveTeamKeys(walletSecret(testSeed()));

jest.setTimeout(30_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(paymentLinks, "getPaymentLinkOrigin").mockReturnValue("https://pay.example");
  // Grants allowed (exportGrantsSuspended false); their suspension is tested below.
  jest.spyOn(assistantsConfig, "exportGrantsSuspended").mockReturnValue(false);
});

afterEach(() => jest.restoreAllMocks());

async function ownerDevice(): Promise<void> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** What the assistant's MCP server reads of its grant, with its secret key alone. */
async function grantOf(secretKey: string): Promise<ExportKeys | null> {
  const access = parseAssistantKey(secretKey)!;
  const keys = deriveAssistantKeys(access.key).exportGrant;
  const answers = await queryRelays(exportGrantFilter(access.teamPublicKey, keys), {
    relays: access.relays,
    timeoutMs: 1000,
    channel: "anonymous"
  });
  return grantedKeys(exportGrantOf(answers, access.teamPublicKey, keys));
}

function refuseAuthor(author: string, on: readonly string[]) {
  const publish = relays.publishEvent;
  return jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
    if (event.pubkey === author && on.includes(url)) {
      throw new RelayRefusal(url, "blocked: not accepting events");
    }
    return publish(url, event, options);
  });
}

describe("allowing an assistant to export the transactions", () => {
  it("gives it the account's reading keys and every seat's, never a key that signs", async () => {
    await ownerDevice();
    const shown = await createAssistant("Carol's Claude");
    expect(await grantOf(shown.secretKey)).toBeNull();
    expect((await loadAssistants()).exports[shown.assistant.id]).toBe("notAllowed");

    await setAssistantExport(shown.assistant, true);
    const granted = await grantOf(shown.secretKey);
    expect(granted).not.toBeNull();
    expect(granted!.account).toEqual({
      registryReader: bytesToHex(deriveRegistryReader(team).secretKey),
      invoices: expect.objectContaining({ author: deriveInvoiceKeys(team).nostr.publicKey }),
      paymentRates: expect.objectContaining({
        author: derivePaymentRateKeys(team).nostr.publicKey
      }),
      walletSends: expect.objectContaining({ author: deriveWalletSendKeys(team).nostr.publicKey }),
      archive: expect.any(Object),
      legacyHistory: expect.any(Object)
    });
    // Itself among the seats, with its invoices' author.
    const own = deriveAssistantKeys(assistantSecretKey(team, shown.assistant.id));
    expect(granted!.seats).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        id: shown.assistant.id,
        name: "Carol's Claude",
        removedAt: null,
        invoices: expect.objectContaining({ author: own.invoices.nostr.publicKey })
      })
    );
    // No secret of the team, of a seat nor of a device: only public keys and reading keys.
    const text = JSON.stringify(granted);
    expect(text).not.toContain(bytesToHex(usableTeamKeys(team).secretKey));
    expect(text).not.toContain(bytesToHex(team.root));
    expect(text).not.toContain(bytesToHex(own.invoices.nostr.secretKey));
    expect(text).not.toContain(bytesToHex(own.member.nostr.secretKey));
    expect((await loadAssistants()).exports[shown.assistant.id]).toBe("allowed");
    // How this device writes its export: the assistant writes so.
    expect(granted!.format).toEqual(deviceFormat());
    expect(granted!.format).toMatchObject({ language: expect.stringMatching(/^[a-z]{2}$/) });
  });

  it("follows the team: an integration created afterwards joins the keys at the next sync", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    const { integration } = await createIntegration("Shop", "woocommerce");
    expect((await grantOf(shown.secretKey))!.seats.some(({ id }) => id === integration.id)).toBe(
      false
    );
    // Synced by a device of another format: the allowing device's stays.
    const allowing = (await grantOf(shown.secretKey))!.format;
    expect(allowing?.locale).not.toBe("de-DE");
    jest.spyOn(deviceLocale, "getDeviceLocale").mockReturnValue({
      languageTag: "de-DE",
      languageCode: "de",
      regionCode: "DE",
      currencyCode: "EUR",
      timeZone: "Europe/Berlin"
    });
    await syncTeamChannels();
    expect((await grantOf(shown.secretKey))!.format).toEqual(allowing);
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    expect((await grantOf(shown.secretKey))!.seats).toContainEqual({
      role: "integration",
      id: integration.id,
      name: "Shop",
      since: integration.createdAt,
      removedAt: null,
      channelKey: bytesToHex(keys.channel.encryptionKey),
      seen: { author: keys.seen.nostr.publicKey, addressKey: bytesToHex(keys.seen.addressKey) },
      paid: { author: keys.paid.nostr.publicKey, addressKey: bytesToHex(keys.paid.addressKey) }
    });
  });

  it("is given again, as it is, to a relay that lost it, at the next sync", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    const access = parseAssistantKey(shown.secretKey)!;
    const filter = exportGrantFilter(team.publicKey, deriveAssistantKeys(access.key).exportGrant);
    const grant = (relay: string) =>
      (relays.stored.get(relay) ?? []).filter(
        (event) =>
          filter.authors?.includes(event.pubkey) &&
          event.tags.some(([name, value]) => name === "d" && filter["#d"]?.includes(value))
      );
    const [lost, kept] = DEFAULT_RELAYS;
    const records = grant(kept!)
      .map(({ id }) => id)
      .sort();
    expect(records.length).toBeGreaterThan(0);
    relays.stored.set(
      lost!,
      (relays.stored.get(lost!) ?? []).filter((event) => !grant(lost!).includes(event))
    );
    expect(grant(lost!)).toEqual([]);

    await syncTeamChannels();

    // The decision and its keys, the same records (the sync gives them once the team's lock is left).
    expect(
      grant(lost!)
        .map(({ id }) => id)
        .sort()
    ).toEqual(records);
  });

  it("withdrawn, gives nothing more and clears the keys", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    await setAssistantExport(shown.assistant, false);
    expect(await grantOf(shown.secretKey)).toBeNull();
    expect((await loadAssistants()).exports[shown.assistant.id]).toBe("notAllowed");
    // No relay keeps a part holding keys.
    const access = parseAssistantKey(shown.secretKey)!;
    const keys = deriveAssistantKeys(access.key).exportGrant;
    const answers = await queryRelays(exportGrantFilter(team.publicKey, keys), {
      relays: DEFAULT_RELAYS,
      timeoutMs: 1000,
      channel: "anonymous"
    });
    const read = exportGrantOf(answers, team.publicKey, keys);
    expect(read.parts.every((found) => found.newest?.value.grantedAt == null)).toBe(true);
    // A sync writes nothing back.
    await syncTeamChannels();
    expect(await grantOf(shown.secretKey)).toBeNull();
  });

  it("is withdrawn when the assistant is removed", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    await removeAssistant(shown.assistant);
    expect(await grantOf(shown.secretKey)).toBeNull();
  });

  it("is decided only when a majority of the relays take it", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    const refused = refuseAuthor(team.publicKey, DEFAULT_RELAYS.slice(0, 3));
    await expect(setAssistantExport(shown.assistant, true)).rejects.toMatchObject({
      code: "unreachable"
    });
    refused.mockRestore();
    expect(await grantOf(shown.secretKey)).toBeNull();
  });

  it("is never written over a newer app's decision", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    const keys = deriveAssistantKeys(assistantSecretKey(team, shown.assistant.id)).exportGrant;
    const now = Math.floor(Date.now() / 1000);
    const newer = sealRecord({
      type: "assistant-export",
      value: { version: 2, allowed: true, updatedAt: now + 60 },
      signer: usableTeamKeys(team).secretKey,
      encryptionKey: keys.encryptionKey,
      address: exportDecisionAddress(keys),
      createdAt: now + 60
    });
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, [newer]);
    expect((await loadAssistants()).exports[shown.assistant.id]).toBe("newer");
    await expect(setAssistantExport(shown.assistant, true)).rejects.toMatchObject({
      code: "exportNewer"
    });
    await syncTeamChannels();
    expect(await grantOf(shown.secretKey)).toBeNull();
    for (const relay of DEFAULT_RELAYS) {
      expect(relays.stored.get(relay)?.some(({ id }) => id === newer.id)).toBe(true);
    }
  });
});

describe("allowing an assistant to export while it is suspended (exportGrantsSuspended)", () => {
  it("is allowed in this build: a grant never opens a link's key (the link key reader)", () => {
    jest.restoreAllMocks();
    expect(assistantsConfig.exportGrantsSuspended()).toBe(false);
  });

  describe("when suspended again", () => {
    beforeEach(() => jest.spyOn(assistantsConfig, "exportGrantsSuspended").mockReturnValue(true));

    it("is refused, writing nothing", async () => {
      await ownerDevice();
      const shown = await createAssistant("Carol's Claude");
      const publish = jest.spyOn(relays, "publishEvent");
      await expect(setAssistantExport(shown.assistant, true)).rejects.toThrow(
        "Allowing an assistant to export is suspended"
      );
      expect(publish).not.toHaveBeenCalled();
      expect(await grantOf(shown.secretKey)).toBeNull();
      expect((await loadAssistants()).exports[shown.assistant.id]).toBe("notAllowed");
    });

    it("still withdraws a grant allowed before", async () => {
      await ownerDevice();
      const shown = await createAssistant("Carol's Claude");
      jest.spyOn(assistantsConfig, "exportGrantsSuspended").mockReturnValue(false);
      await setAssistantExport(shown.assistant, true);
      expect(await grantOf(shown.secretKey)).not.toBeNull();

      jest.spyOn(assistantsConfig, "exportGrantsSuspended").mockReturnValue(true);
      await setAssistantExport(shown.assistant, false);
      expect(await grantOf(shown.secretKey)).toBeNull();
      expect((await loadAssistants()).exports[shown.assistant.id]).toBe("notAllowed");
    });
  });
});
