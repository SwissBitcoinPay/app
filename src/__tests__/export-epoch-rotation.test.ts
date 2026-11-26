import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import * as assistantsConfig from "@/config/assistants";
import * as paymentLinks from "@/config/payment-links";
import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { ownerEpoch } from "@/features/team/export-epochs";
import {
  createAssistant,
  inviteEmployee,
  removeAssistant,
  setAssistantExport,
  syncTeamChannels
} from "@/features/team/owner";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import {
  EXPORT_GRANT_EPOCH_VERSION,
  exportDecisionEvent,
  exportGrantFilter,
  exportGrantOf,
  grantedKeys,
  type ExportKeys
} from "@/lib/assistant/export-grant";
import { deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import { resetEpochHolders } from "@/lib/nostr/epochs";
import { conversationKey, nip44Decrypt } from "@/lib/nostr/nip44";
import { queryRelays } from "@/lib/nostr/pool";
import { EPOCH_ENVELOPE_VERSION, openRecord } from "@/lib/nostr/record";
import { fetchChannel } from "@/lib/team/channel";
import {
  EpochSeeds,
  exportEpochAuthor,
  exportEpochKey,
  exportEpochReader,
  exportEpochSeed,
  readExportEpoch
} from "@/lib/team/export-epoch";
import {
  assistantSecretKey,
  deriveMemberKeys,
  deriveTeamKeys,
  deriveWalletSendKeys,
  memberSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { walletSendEvent } from "@/lib/wallet-sends/record";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The rotation of the export grants' keys: each grant that ends
 * raises the account's export epoch; the grants still allowed name the new one, the withdrawn one
 * reads nothing written since, and the employees' channels give their devices its keys.
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
jest.mock("../config/team", () => ({
  ...jest.requireActual("../config/team"),
  getInviteOrigin: () => "https://web.example"
}));
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const team = deriveTeamKeys(walletSecret(testSeed()));
const shared = ownerDevicesSecret(team);

jest.setTimeout(30_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(paymentLinks, "getPaymentLinkOrigin").mockReturnValue("https://pay.example");
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

const epochOnRelays = async () => (await readExportEpoch(shared, DEFAULT_RELAYS)).epoch;

/** A wallet's sending, as the app records it. */
const send = (payment: string) => ({
  payment,
  at: 1790000000,
  sats: 1000n,
  feeSats: 2n,
  network: "lightning" as const,
  reference: payment,
  text: null
});

describe("a grant that ends", () => {
  it("raises the epoch: the other grants name it, the withdrawn one opens nothing written since", async () => {
    await ownerDevice();
    const carol = await createAssistant("Carol's Claude");
    const frank = await createAssistant("Frank's assistant");
    await setAssistantExport(carol.assistant, true);
    await setAssistantExport(frank.assistant, true);
    const before = (await grantOf(carol.secretKey))!;
    // Epoch 0: format 1, as before epochs.
    expect(before.account.epoch).toBeUndefined();
    expect(await epochOnRelays()).toBe(0);

    await setAssistantExport(carol.assistant, false);
    expect(await grantOf(carol.secretKey)).toBeNull();
    expect(await epochOnRelays()).toBe(1);
    expect(ownerEpoch(TEST_WALLET_ID)?.epoch).toBe(1);
    // The sync it started: Frank's grant names the new epoch, in format 2.
    await syncTeamChannels();
    const granted = (await grantOf(frank.secretKey))!;
    expect(granted.account.epoch).toEqual({
      epoch: 1,
      seed: bytesToHex(exportEpochSeed(shared, 1))
    });

    // A sending recorded since: sealed at epoch 1.
    const keys = deriveWalletSendKeys(team);
    const event = walletSendEvent(keys, send("p1"));
    const outside = JSON.parse(nip44Decrypt(event.content, keys.encryptionKey).trim()) as {
      v: { version: number; epoch: number };
    };
    expect(outside.v).toMatchObject({ version: EPOCH_ENVELOPE_VERSION, epoch: 1 });
    // What Carol's copy of its keys opens: the envelope, never what it seals.
    resetEpochHolders();
    const asCarol = openRecord(event, {
      type: "wallet-send",
      encryptionKey: hexToBytes(before.account.walletSends.encryptionKey),
      address: () => true,
      parse: (value) => value
    });
    expect(asCarol?.status).toBe("newer");
    // What Frank's grant opens: its seed gives the key of the epoch.
    const seeds = new EpochSeeds({ epoch: 1, seed: hexToBytes(granted.account.epoch!.seed) });
    const asPaul = openRecord(event, {
      type: "wallet-send",
      encryptionKey: hexToBytes(granted.account.walletSends.encryptionKey),
      address: () => true,
      parse: (value) => value,
      epochKey: (epoch) => seeds.keyOf(epoch, hexToBytes(granted.account.walletSends.encryptionKey))
    });
    expect(asPaul?.status).toBe("ok");
  });

  it("raises the epoch when its assistant is removed", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    await removeAssistant(shown.assistant);
    expect(await grantOf(shown.secretKey)).toBeNull();
    expect(await epochOnRelays()).toBe(1);
  });

  it("raises nothing for an assistant never allowed", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await removeAssistant(shown.assistant);
    await syncTeamChannels();
    expect(await epochOnRelays()).toBe(0);
  });

  it("raises the epoch at the next sync after a withdrawal by an app of before", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    // Withdrawn as an app before epochs does it: the decision, no raise.
    const keys = deriveAssistantKeys(assistantSecretKey(team, shown.assistant.id)).exportGrant;
    const withdrawn = exportDecisionEvent(team.secretKey, keys, {
      allowed: false,
      updatedAt: Math.floor(Date.now() / 1000) + 5
    });
    for (const relay of DEFAULT_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), withdrawn]);
    }
    await syncTeamChannels();
    expect(await epochOnRelays()).toBe(1);
    // Once: the next sync raises nothing more.
    await syncTeamChannels();
    expect(await epochOnRelays()).toBe(1);
  });

  it("is not withdrawn when the epoch cannot be raised: the next sync raises it", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    const author = exportEpochAuthor(shared).publicKey;
    const publish = relays.publishEvent;
    const refused = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, o) => {
      if (event.pubkey === author) throw new Error("refused");
      return publish(url, event, o);
    });
    await expect(setAssistantExport(shown.assistant, false)).rejects.toMatchObject({
      code: "unreachable"
    });
    // The decision withdrawn all the same: the assistant exports nothing.
    expect(await grantOf(shown.secretKey)).toBeNull();
    expect(await epochOnRelays()).toBe(0);
    refused.mockRestore();
    await syncTeamChannels();
    expect(await epochOnRelays()).toBe(1);
  });
});

describe("an employee's channel", () => {
  it("gives its device the keys of the new epoch for its own records and declarations", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const shown = await createAssistant("Claude");
    await setAssistantExport(shown.assistant, true);
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const read = async () => {
      const found = await fetchChannel(team.publicKey, keys);
      return found.status === "found" && found.channel.status === "active" ? found.channel : null;
    };
    expect((await read())?.exportEpoch).toBeUndefined();

    await setAssistantExport(shown.assistant, false);
    await syncTeamChannels();
    const seed = exportEpochSeed(shared, 1);
    expect((await read())?.exportEpoch).toEqual({
      epoch: 1,
      epochs: [
        {
          epoch: 1,
          key: bytesToHex(exportEpochKey(seed, keys.records.encryptionKey)),
          reader: exportEpochReader(seed).publicKey
        }
      ]
    });
    // The reading key's public half only: never its secret.
    expect(JSON.stringify(await read())).not.toContain(
      bytesToHex(exportEpochReader(seed).secretKey)
    );
    // A conversation with that reader opens what Alice's sales declare at it.
    expect(conversationKey(exportEpochReader(seed).secretKey, keys.nostr.publicKey)).toHaveLength(
      32
    );
  });
});

describe("the grant's format at an epoch", () => {
  it("is 2, which a reader of format 1 takes for a newer one", async () => {
    await ownerDevice();
    const a = await createAssistant("A");
    const b = await createAssistant("B");
    await setAssistantExport(a.assistant, true);
    await setAssistantExport(b.assistant, true);
    await setAssistantExport(a.assistant, false);
    await syncTeamChannels();
    const access = parseAssistantKey(b.secretKey)!;
    const keys = deriveAssistantKeys(access.key).exportGrant;
    const answers = await queryRelays(exportGrantFilter(access.teamPublicKey, keys), {
      relays: access.relays,
      timeoutMs: 1000,
      channel: "anonymous"
    });
    const read = exportGrantOf(answers, access.teamPublicKey, keys);
    expect(read.parts[0]?.newest?.value).toMatchObject({ version: EXPORT_GRANT_EPOCH_VERSION });
  });
});
