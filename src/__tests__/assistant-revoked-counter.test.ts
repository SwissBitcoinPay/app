import { hexToBytes } from "@noble/hashes/utils.js";

import * as paymentLinks from "@/config/payment-links";
import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_NUMBER_JUMP } from "@/config/team";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { checkAssistants } from "@/features/invoices/assistant-alerts";
import {
  loadInvoices,
  resetInvoicesUpkeep,
  saveDraft,
  type InvoiceForm
} from "@/features/invoices/invoices";
import {
  createAssistant,
  removeAssistant,
  syncTeamChannels,
  type ShownAssistant
} from "@/features/team/owner";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import { counterEvent, sharedCounterKeys, takeSharedInvoiceNumber } from "@/lib/invoice/counter";
import { sealRecord } from "@/lib/nostr/record";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { RelayRefusal } from "@/lib/nostr/relay-errors";
import { fetchChannel } from "@/lib/team/channel";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  invoiceCounterKey
} from "@/lib/team/keys";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The key of an assistant, once removed, must never stop the business's numbers
 * (src/lib/invoice/counter.ts, src/features/team/numbering.ts). Its holder knows the shared
 * counter's key and may publish any copy as its author; the owner removes it.
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
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const team = deriveTeamKeys(walletSecret(testSeed()));
const owner = deriveInvoiceKeys(team);
const shared = sharedCounterKeys(invoiceCounterKey(team));
const YEAR = new Date().getFullYear();
const nowUnix = () => Math.floor(Date.now() / 1000);
const call = (secretKey: Uint8Array) => ({
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: secretKey
});

jest.setTimeout(30_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  resetInvoicesUpkeep();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(paymentLinks, "getPaymentLinkOrigin").mockReturnValue("https://pay.example");
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

/** The owner's device: its account open (done), its point of sale prepared. */
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

function form(): InvoiceForm {
  return {
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Station Road",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: [{ name: "Consulting", quantity: 100, unitMinor: 120000, vatRate: 810 }],
    dueDate: null,
    terms: "",
    legal: "",
    redirectUrl: null
  };
}

const invoicesOf = (shown: ShownAssistant) =>
  deriveAssistantKeys(assistantSecretKey(team, shown.assistant.id)).invoices;

/** The writers of numbers its channel names, as its MCP server reads them with its key alone. */
async function writersOf(shown: ShownAssistant): Promise<string[]> {
  const access = parseAssistantKey(shown.secretKey)!;
  const keys = deriveAssistantKeys(access.key).member;
  const found = await fetchChannel(access.teamPublicKey, keys, 1000, access.relays);
  if (found.status !== "found" || found.channel.status !== "active") throw new Error("No channel");
  return found.channel.invoicing!.counterWriters;
}

/** The assistant takes the next number, as its MCP server does with what its channel names. */
async function assistantTakes(shown: ShownAssistant) {
  const own = invoicesOf(shown);
  const access = parseAssistantKey(shown.secretKey)!;
  const found = await fetchChannel(
    access.teamPublicKey,
    deriveAssistantKeys(access.key).member,
    1000,
    access.relays
  );
  if (found.status !== "found" || found.channel.status !== "active") throw new Error("No channel");
  const { counterKey, counterWriters } = found.channel.invoicing!;
  return takeSharedInvoiceNumber(
    {
      own,
      shared: sharedCounterKeys(hexToBytes(counterKey)),
      writers: counterWriters,
      legacy: false
    },
    call(own.nostr.secretKey),
    YEAR,
    nowUnix()
  );
}

/** Its key's holder publishes a copy of its own, `value` as it likes, dated `at`. */
async function forgedCopy(shown: ShownAssistant, value: unknown, at = nowUnix() + 5) {
  const own = invoicesOf(shown);
  await publishToRelays(
    sealRecord({
      type: "invoice-counter-shared",
      value,
      signer: own.nostr.secretKey,
      encryptionKey: shared.encryptionKey,
      address: shared.address,
      createdAt: at
    }),
    call(own.nostr.secretKey)
  );
}

/** The owner's copy of the shared counter, as a majority of the relays give it. */
async function ownerCopyEvents() {
  const answers = await queryRelays(
    { kinds: [30078], authors: [owner.nostr.publicKey], "#d": [shared.address] },
    call(owner.nostr.secretKey),
    { quorum: "majority" }
  );
  return [...answers.values()].flat() as { created_at: number }[];
}

describe("a removed assistant's key", () => {
  it("can no longer stop the numbers of the owner nor of the other assistants", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    const mistral = await createAssistant("Mistral");
    await expect(assistantTakes(claude)).resolves.toEqual({ year: YEAR, sequence: 1 });
    await expect(assistantTakes(claude)).resolves.toEqual({ year: YEAR, sequence: 2 });
    await removeAssistant(claude.assistant);
    // The owner's copy took its last number, then the other's channel stopped naming it.
    expect(await writersOf(mistral)).toEqual([owner.nostr.publicKey]);
    expect((await ownerCopyEvents()).length).toBeGreaterThan(0);

    // Its key's holder: a copy of a newer format, then one at the end of safe integers.
    await forgedCopy(claude, { version: 2, year: YEAR, last: 7 });
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 3 });
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 4 });
    await forgedCopy(
      claude,
      { version: 1, year: YEAR, last: Number.MAX_SAFE_INTEGER - 1 },
      nowUnix() + 10
    );
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 5 });
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 6 });

    // Another session of the owner's (nothing in memory): still never stopped.
    closeAccount();
    await ownerDevice();
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 7 });
    await syncTeamChannels();
    expect(await writersOf(mistral)).toEqual([owner.nostr.publicKey]);
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 8 });
  });

  it("stays named while the owner's copy could not take its numbers: never one given twice", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    const mistral = await createAssistant("Mistral");
    await expect(assistantTakes(claude)).resolves.toEqual({ year: YEAR, sequence: 1 });
    // The relays refuse the owner's copy of the counter (its invoices' author) for a while.
    const publish = relays.publishEvent;
    const refusing = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === owner.nostr.publicKey) {
          throw new RelayRefusal(url, "blocked: not accepting events");
        }
        return publish(url, event, options);
      });
    await removeAssistant(claude.assistant);
    // Not taken: the other's channel still names it, and reads its last number.
    expect(await writersOf(mistral)).toContain(invoicesOf(claude).nostr.publicKey);
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 2 });

    // The next sync of the team takes it: the other's channel stops naming it.
    refusing.mockRestore();
    await syncTeamChannels();
    expect(await writersOf(mistral)).toEqual([owner.nostr.publicKey]);
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 3 });
  });
});

describe("an assistant in the team", () => {
  it("making the numbers jump within MAX_NUMBER_JUMP is followed: never a number given twice", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    await forgedCopy(claude, { version: 1, year: YEAR, last: 50 });
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 51 });
  });

  it("making them jump further is left out, for the owner and the other assistants", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    const mistral = await createAssistant("Mistral");
    await forgedCopy(claude, { version: 1, year: YEAR, last: MAX_NUMBER_JUMP + 1 });
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 1 });
    await expect(assistantTakes(mistral)).resolves.toEqual({ year: YEAR, sequence: 2 });
    await forgedCopy(
      claude,
      { version: 1, year: YEAR, last: Number.MAX_SAFE_INTEGER },
      nowUnix() + 10
    );
    expect((await saveDraft(form(), null, [])).number).toEqual({ year: YEAR, sequence: 3 });
  });
});

describe("the owner's counter", () => {
  it("is never saved past safe integers", async () => {
    await ownerDevice();
    await publishToRelays(
      counterEvent(owner, { version: 1, year: YEAR, last: Number.MAX_SAFE_INTEGER }, nowUnix()),
      call(owner.nostr.secretKey)
    );
    await expect(saveDraft(form(), null, [])).rejects.toMatchObject({ code: "number" });
    // Neither its copy of the shared counter nor its counter of format 1 written over.
    expect(await ownerCopyEvents()).toEqual([]);
  });
});

describe('"Wallet"\'s warnings, from what the relays hold', () => {
  const alertsNow = async () => {
    const listed = await loadInvoices();
    return checkAssistants(listed.invoices, listed.authors, YEAR);
  };

  it("tell an assistant whose copy runs ahead of its invoices, or that the app cannot read", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    const mistral = await createAssistant("Mistral");
    await expect(alertsNow()).resolves.toEqual([]);
    await forgedCopy(claude, { version: 1, year: YEAR, last: 100 });
    await forgedCopy(mistral, { version: 2, year: YEAR, last: 1 });
    await expect(alertsNow()).resolves.toMatchObject([
      { kind: "blocked", assistant: { id: mistral.assistant.id } },
      { kind: "jump", assistant: { id: claude.assistant.id }, from: 0, to: 100 }
    ]);
    // Removed: no warning about it any more (it takes no number).
    await removeAssistant(claude.assistant);
    await expect(alertsNow()).resolves.toMatchObject([{ kind: "blocked" }]);
  });

  it("tell nothing while a majority of the relays did not answer", async () => {
    await ownerDevice();
    const claude = await createAssistant("Claude");
    await forgedCopy(claude, { version: 1, year: YEAR, last: 100 });
    const listed = await loadInvoices();
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(checkAssistants(listed.invoices, listed.authors, YEAR)).resolves.toEqual([]);
  });
});
