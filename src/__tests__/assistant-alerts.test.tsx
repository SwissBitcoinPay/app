import "@/i18n";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  ASSISTANT_BURST_INVOICES,
  ASSISTANT_BURST_SECONDS,
  ASSISTANT_JUMP_ALERT
} from "@/config/team";
import {
  ASSISTANT_ALERTS_KEY,
  MAX_DISMISSALS,
  parseStoredDismissals,
  serializeDismissals
} from "@/features/invoices/alert-dismissals-format";
import { AssistantAlertDialog } from "@/features/invoices/AssistantAlertDialog";
import {
  assistantAlertKey,
  assistantAlerts,
  checkAssistants,
  type AssistantAlert
} from "@/features/invoices/assistant-alerts";
import type { InvoiceAuthor } from "@/features/invoices/invoices";
import { useInvoices } from "@/features/invoices/store";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { removeAssistant } from "@/features/team/owner";
import type { WriterCopy } from "@/features/team/numbering";
import type { Invoice } from "@/lib/invoice/record";
import type { Assistant } from "@/lib/team/roster";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * "Wallet"'s warnings about an assistant (src/features/invoices/assistant-alerts.ts): its numbers
 * skipped, blocked, or a flood of invoices; "Remove the assistant" or "This is expected", kept on
 * the device.
 */

jest.mock("@/features/team/owner", () => ({ removeAssistant: jest.fn() }));
jest.mock("@/features/invoices/store", () => ({ useInvoices: jest.fn() }));
jest.mock("@/features/invoices/assistant-alerts", () => ({
  ...jest.requireActual("@/features/invoices/assistant-alerts"),
  checkAssistants: jest.fn()
}));
jest.mock("@/features/account/session", () => ({
  ...jest.requireActual("@/features/account/session"),
  getAccountWalletId: () => "wallet-test"
}));

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const check = jest.mocked(checkAssistants);
const remove = jest.mocked(removeAssistant);

const YEAR = 2026;
const NOW = 1_791_500_000;
const claude: Assistant = { id: "ab".repeat(16), name: "Claude", createdAt: NOW - 86_400 * 30 };
const mistral: Assistant = { id: "cd".repeat(16), name: "Mistral", createdAt: NOW - 86_400 * 30 };

/** Invoices of `assistant` numbered `sequences`, made `spacing` seconds apart. */
function invoicesOf(assistant: Assistant, sequences: readonly number[], spacing = 3600) {
  return sequences.map(
    (sequence, index) =>
      ({
        id: `${assistant.id}-${sequence}`,
        number: { year: YEAR, sequence },
        createdAt: NOW + index * spacing
      }) as Invoice
  );
}

function authorsOf(invoices: readonly Invoice[], assistant: Assistant) {
  return new Map<string, InvoiceAuthor>(
    invoices.map(({ id }) => [id, { id: assistant.id, name: assistant.name }])
  );
}

const read = (last: number, year = YEAR): WriterCopy => ({
  status: "read",
  counter: { version: 1, year, last }
});

describe("the warnings about the assistants", () => {
  it("tell a copy of the counter more than ASSISTANT_JUMP_ALERT above its last invoice", () => {
    const invoices = invoicesOf(claude, [1, 2, 3]);
    const authors = authorsOf(invoices, claude);
    const at = (last: number) =>
      assistantAlerts({
        assistants: [claude],
        copies: new Map([[claude.id, read(last)]]),
        invoices,
        authors,
        year: YEAR
      });
    // Numbers lost now and then (an invoice no majority took): no warning.
    expect(at(3 + ASSISTANT_JUMP_ALERT)).toEqual([]);
    expect(at(3 + ASSISTANT_JUMP_ALERT + 1)).toEqual([
      { kind: "jump", assistant: claude, year: YEAR, from: 3, to: 3 + ASSISTANT_JUMP_ALERT + 1 }
    ]);
  });

  it("tell a jump of an assistant without invoices, or of a coming year; never a past year's", () => {
    const of = (copy: WriterCopy) =>
      assistantAlerts({
        assistants: [claude],
        copies: new Map([[claude.id, copy]]),
        invoices: [],
        authors: new Map(),
        year: YEAR
      });
    expect(of(read(100))).toMatchObject([{ kind: "jump", from: 0, to: 100 }]);
    expect(of(read(100, YEAR + 1))).toMatchObject([{ kind: "jump", year: YEAR + 1, to: 100 }]);
    expect(of(read(100, YEAR - 1))).toEqual([]);
    expect(of({ status: "none" })).toEqual([]);
  });

  it("tell a copy of a format this app cannot read: it stops every number", () => {
    expect(
      assistantAlerts({
        assistants: [claude],
        copies: new Map([[claude.id, { status: "newer" }]]),
        invoices: [],
        authors: new Map(),
        year: YEAR
      })
    ).toEqual([{ kind: "blocked", assistant: claude }]);
  });

  it("tell more than ASSISTANT_BURST_INVOICES invoices within any ASSISTANT_BURST_SECONDS", () => {
    const sequences = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
    const spacing = Math.floor(ASSISTANT_BURST_SECONDS / ASSISTANT_BURST_INVOICES) - 1;
    const of = (invoices: Invoice[]) =>
      assistantAlerts({
        assistants: [claude],
        copies: new Map([[claude.id, read(invoices.length)]]),
        invoices,
        authors: authorsOf(invoices, claude),
        year: YEAR
      });
    expect(of(invoicesOf(claude, sequences(ASSISTANT_BURST_INVOICES), spacing))).toEqual([]);
    expect(of(invoicesOf(claude, sequences(ASSISTANT_BURST_INVOICES + 1), spacing))).toEqual([
      { kind: "burst", assistant: claude, count: ASSISTANT_BURST_INVOICES + 1 }
    ]);
    // As many, spread over more than the span: no warning.
    expect(
      of(invoicesOf(claude, sequences(ASSISTANT_BURST_INVOICES + 1), ASSISTANT_BURST_SECONDS / 50))
    ).toEqual([]);
  });

  it("count each assistant's own invoices only, the most serious first", () => {
    const theirs = invoicesOf(mistral, [1, 2]);
    const alerts = assistantAlerts({
      assistants: [claude, mistral],
      copies: new Map([
        [claude.id, read(50)],
        [mistral.id, { status: "newer" }]
      ]),
      invoices: theirs,
      authors: authorsOf(theirs, mistral),
      year: YEAR
    });
    expect(alerts.map(({ kind, assistant }) => [kind, assistant.name])).toEqual([
      ["blocked", "Mistral"],
      ["jump", "Claude"]
    ]);
  });

  it("are answered once each: a further jump warns again", () => {
    const jump = (to: number): AssistantAlert => ({
      kind: "jump",
      assistant: claude,
      year: YEAR,
      from: 3,
      to
    });
    expect(assistantAlertKey(jump(50))).not.toBe(assistantAlertKey(jump(60)));
    expect(assistantAlertKey({ kind: "burst", assistant: claude, count: 101 })).toBe(
      assistantAlertKey({ kind: "burst", assistant: claude, count: 300 })
    );
  });
});

describe("the answers kept on the device", () => {
  it("are kept under a name installed apps keep", () => {
    expect(ASSISTANT_ALERTS_KEY).toBe("assistant-alerts-dismissed");
  });

  it("read nothing damaged, of another format, or too long; keep the latest", () => {
    expect(parseStoredDismissals(null)).toEqual([]);
    expect(parseStoredDismissals("{")).toEqual([]);
    expect(parseStoredDismissals(JSON.stringify({ version: 2, keys: ["a"] }))).toEqual([]);
    expect(
      parseStoredDismissals(JSON.stringify({ version: 1, keys: ["a", 3, "", "x".repeat(121)] }))
    ).toEqual(["a"]);
    const many = Array.from({ length: MAX_DISMISSALS + 5 }, (_, index) => `k${index}`);
    expect(parseStoredDismissals(serializeDismissals(many))).toEqual(many.slice(5));
  });
});

describe('"Wallet"\'s warning', () => {
  const jump: AssistantAlert = { kind: "jump", assistant: claude, year: YEAR, from: 10, to: 100 };
  const ready = { status: "ready", invoices: [], authors: new Map(), newerUnreadable: false };

  beforeEach(() => {
    jest.mocked(useInvoices).mockReturnValue({ ...ready, retry: jest.fn() } as never);
    check.mockReset();
    remove.mockReset();
  });

  async function show() {
    await render(
      <NotificationsProvider>
        <AssistantAlertDialog />
      </NotificationsProvider>
    );
  }

  it("waits for the invoices listed: nothing checked before", async () => {
    jest.mocked(useInvoices).mockReturnValue({
      status: "loading",
      invoices: null,
      retry: jest.fn()
    } as never);
    check.mockResolvedValue([jump]);
    await show();
    expect(check).not.toHaveBeenCalled();
    expect(screen.queryByText("Claude skipped invoice numbers")).toBeNull();
  });

  it('keeps "This is expected" on the device: never asked again for that jump', async () => {
    check.mockResolvedValue([jump]);
    await show();
    expect(await screen.findByText("Claude skipped invoice numbers")).toBeTruthy();
    expect(screen.getByText(/2026-0010.*2026-0100/)).toBeTruthy();
    await fireEvent.press(screen.getByText("This is expected"));
    await waitFor(() =>
      expect(parseStoredDismissals(secureStore.items.get(ASSISTANT_ALERTS_KEY) ?? null)).toEqual([
        assistantAlertKey(jump)
      ])
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('never shows again a warning answered "This is expected" on this device', async () => {
    secureStore.items.set(ASSISTANT_ALERTS_KEY, serializeDismissals([assistantAlertKey(jump)]));
    check.mockResolvedValue([jump]);
    await show();
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Claude skipped invoice numbers")).toBeNull();
  });

  it('removes the assistant on "Remove the assistant", then shows the next warning', async () => {
    const burst: AssistantAlert = { kind: "burst", assistant: mistral, count: 140 };
    check.mockResolvedValue([jump, burst]);
    let done!: () => void;
    remove.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        })
    );
    await show();
    await fireEvent.press(await screen.findByTestId("assistant-alert-remove"));
    expect(remove).toHaveBeenCalledWith(claude);
    await act(async () => done());
    expect(await screen.findByText("Assistant removed")).toBeTruthy();
    expect(await screen.findByText("Mistral made a lot of invoices")).toBeTruthy();
    expect(screen.getByText(/^140 invoices in 24 hours/)).toBeTruthy();
  });

  it("tells a removal that failed, and keeps no answer", async () => {
    check.mockResolvedValue([jump]);
    remove.mockRejectedValue(new Error("unreachable"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await show();
    await fireEvent.press(await screen.findByTestId("assistant-alert-remove"));
    expect(await screen.findByText("Assistant not removed")).toBeTruthy();
    expect(secureStore.items.get(ASSISTANT_ALERTS_KEY)).toBeUndefined();
    jest.restoreAllMocks();
  });
});
