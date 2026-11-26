import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount } from "@/features/account/session";
import {
  InvoiceError,
  resetInvoicesUpkeep,
  saveDraft,
  type InvoiceForm
} from "@/features/invoices/invoices";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import {
  sharedCounterEvent,
  sharedCounterKeys,
  takeSharedInvoiceNumber
} from "@/lib/invoice/counter";
import { publishToRelays } from "@/lib/nostr/pool";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  invoiceCounterKey
} from "@/lib/team/keys";

import { openTestAccount, testSeed } from "../../jest/account";
import { publishAssistant } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's invoices of "New invoice" take their numbers in the series their assistants
 * share (src/lib/invoice/counter.ts).
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const team = deriveTeamKeys(walletSecret(testSeed()));
const owner = deriveInvoiceKeys(team);
const shared = sharedCounterKeys(invoiceCounterKey(team));
const YEAR = new Date().getFullYear();
const nowUnix = () => Math.floor(Date.now() / 1000);
const claude = { id: "ab".repeat(16), name: "Carol's Claude", createdAt: nowUnix() - 3600 };
const assistant = deriveAssistantKeys(assistantSecretKey(team, claude.id)).invoices;

function form(): InvoiceForm {
  return {
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Gold Cross Street",
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

/** The assistant takes the next number, as its MCP server does with its channel. */
function assistantTakes() {
  return takeSharedInvoiceNumber(
    { own: assistant, shared, writers: [owner.nostr.publicKey], legacy: false },
    {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: assistant.nostr.secretKey
    },
    YEAR,
    nowUnix()
  );
}

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  resetInvoicesUpkeep();
  await openTestAccount({ usage: "merchant", signUp: "done" });
});

afterEach(() => closeAccount());

describe("the owner's invoices and its assistants'", () => {
  it("share one series: each takes the number after the other's", async () => {
    await publishAssistant(team, claude);
    const first = await saveDraft(form(), null, []);
    expect(first.number).toEqual({ year: YEAR, sequence: 1 });
    await expect(assistantTakes()).resolves.toEqual({ year: YEAR, sequence: 2 });
    const second = await saveDraft(form(), null, [first]);
    expect(second.number).toEqual({ year: YEAR, sequence: 3 });
  });

  it("count an assistant removed within the year: its last number is never given again", async () => {
    await publishAssistant(team, claude);
    await expect(assistantTakes()).resolves.toEqual({ year: YEAR, sequence: 1 });
    await publishAssistant(team, claude, { removedAt: nowUnix() - 60 });
    const draft = await saveDraft(form(), null, []);
    expect(draft.number).toEqual({ year: YEAR, sequence: 2 });
  });

  it("no longer count an assistant removed more than a year ago", async () => {
    const longAgo = nowUnix() - 2 * 366 * 24 * 3600;
    await publishAssistant(team, { ...claude, createdAt: longAgo - 3600 }, { removedAt: longAgo });
    // Its key leaked: a copy its holder made since never counts.
    await publishToRelays(
      sharedCounterEvent(shared, assistant.nostr, { version: 1, year: YEAR, last: 500 }, nowUnix()),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: assistant.nostr.secretKey
      }
    );
    const draft = await saveDraft(form(), null, []);
    expect(draft.number).toEqual({ year: YEAR, sequence: 1 });
  });

  it("give no number while a majority of the relays did not give the roster", async () => {
    await publishAssistant(team, claude);
    await assistantTakes();
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(saveDraft(form(), null, [])).rejects.toMatchObject({ code: "number" });
    await expect(saveDraft(form(), null, [])).rejects.toBeInstanceOf(InvoiceError);
  });
});
