import "@/i18n";

import { act, render, screen, waitFor } from "@testing-library/react-native";

import { CARD_POS_WAIT_MS, CARD_RELAY_WAIT_MS } from "@/config/card";
import { BoltCardReader } from "@/features/terminal/BoltCardReader";
import { requestInvoice, type PayRequest } from "@/lib/lightning/lnurl";

import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";

// The card is read on Android as soon as the invoice shows: its LNURL is the test's.
const mockCard = { lnurl: "" };
jest.mock("../lib/nfc/boltcard", () => ({
  getCardReading: async () => "auto",
  isReadCancelled: () => false,
  readCard: () => ({ lnurl: Promise.resolve(mockCard.lnurl), cancel: () => undefined })
}));

const METADATA = JSON.stringify([
  ["text/plain", "Lakeside Bakery + Coffee"],
  ["text/identifier", "sattleme02c6047f94@breez.tips"]
]);
const { paymentHash } = preimagePair(9);
const VERIFY = `https://breez.tips/lnurlp/verify/${paymentHash}`;

/** The point of sale's invoice, as requestInvoice gives it (with its payRequest's metadata). */
async function posInvoice() {
  const pay: PayRequest = {
    callback: new URL("https://breez.tips/lnurlp/sattleme02c6047f94/invoice"),
    minSendableMsat: 1000n,
    maxSendableMsat: 100_000_000_000n,
    metadata: METADATA,
    commentAllowed: 255
  };
  const pr = makeInvoice({
    amountMsat: 12_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA)
  });
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ pr, verify: VERIFY })
  })) as unknown as typeof fetch;
  return requestInvoice(pay, { amountSats: 12_000n, network: "bc" }, { fetchImpl });
}

/** The card relay: its withdrawRequest (with or without `payeeProof`), and the callbacks it got. */
function cardRelay(payeeProof: boolean | undefined, maxWithdrawable = 100_000_000) {
  const callbacks: URL[] = [];
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const body =
      url.pathname === "/w"
        ? {
            tag: "withdrawRequest",
            callback: "https://relay.sattle.me/cb/0123456789abcdef0123456789abcdef",
            k1: "a".repeat(64),
            minWithdrawable: 1000,
            maxWithdrawable,
            defaultDescription: "",
            ...(payeeProof === undefined ? {} : { payeeProof })
          }
        : (callbacks.push(url), { status: "OK" });
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  return callbacks;
}

/**
 * The card relay of a holder who answers late: the callback is answered `afterMs` after it was sent
 * (fake timers), unless the point of sale gave up first (aborted). The callbacks it got.
 */
function slowCardRelay(afterMs: number) {
  const callbacks: URL[] = [];
  jest.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/w") {
      const body = {
        tag: "withdrawRequest",
        callback: "https://relay.sattle.me/cb/0123456789abcdef0123456789abcdef",
        k1: "a".repeat(64),
        minWithdrawable: 1000,
        maxWithdrawable: 100_000_000_000,
        payeeProof: true
      };
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    callbacks.push(url);
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(
        () => resolve({ ok: true, status: 200, json: async () => ({ status: "OK" }) } as Response),
        afterMs
      );
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      });
    });
  });
  return callbacks;
}

beforeEach(() => {
  mockCard.lnurl =
    "lnurlw://relay.sattle.me/w?p=00112233445566778899AABBCCDDEEFF&c=0011223344556677";
});

describe("a BoltCard tapped at the point of sale", () => {
  it("sends the payee's proof with the invoice to a card relay that asks for it", async () => {
    const callbacks = cardRelay(true);
    await render(<BoltCardReader invoice={await posInvoice()} />);
    await waitFor(() => expect(callbacks).toHaveLength(1));
    const [callback] = callbacks;
    expect(callback.searchParams.get("k1")).toBe("a".repeat(64));
    expect(callback.searchParams.get("metadata")).toBe(METADATA);
    expect(callback.searchParams.get("verify")).toBe(VERIFY);
    expect(await screen.findByText(/Card payment sent/)).toBeTruthy();
  });

  it("waits for the holder's answer as long as the card relay does, never refusing the card before", async () => {
    // The card relay answers once the holder confirmed: 50 s later here, 65 s at most (relay 2.1.0).
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const invoice = await posInvoice();
      const callbacks = slowCardRelay(50_000);
      const onRefusal = jest.fn();
      await render(<BoltCardReader invoice={invoice} onRefusal={onRefusal} />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(callbacks).toHaveLength(1);
      // Past LNURL's usual 10 s: still waiting for the holder, never a refusal.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(screen.getByText("Card payment in progress…")).toBeTruthy();
      expect(onRefusal).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.any(String) })
      );
      await act(async () => {
        await jest.advanceTimersByTimeAsync(20_000);
      });
      expect(screen.getByText(/Card payment sent/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("waits for an answer the relay sends at the end of its wait, a network trip later", async () => {
    // The relay counts its 65 s from when the request reached it.
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const invoice = await posInvoice();
      const callbacks = slowCardRelay(CARD_RELAY_WAIT_MS + 400);
      await render(<BoltCardReader invoice={invoice} />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(callbacks).toHaveLength(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CARD_RELAY_WAIT_MS);
      });
      expect(screen.getByText("Card payment in progress…")).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      expect(screen.getByText(/Card payment sent/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses the card once its service never answered, past the relay's wait", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const invoice = await posInvoice();
      slowCardRelay(10 * 60_000);
      const onRefusal = jest.fn();
      await render(<BoltCardReader invoice={invoice} onRefusal={onRefusal} />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CARD_POS_WAIT_MS - 1);
      });
      expect(screen.getByText("Card payment in progress…")).toBeTruthy();
      expect(onRefusal).toHaveBeenLastCalledWith(null);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(onRefusal).toHaveBeenLastCalledWith({
        title: "Card payment interrupted",
        message:
          "The card's service did not answer. Present the card again, or have the code scanned."
      });
      // The line invites a card again; the refusal shows over the code (CardRefusalVeil).
      expect(screen.getByText("Or tap the BoltCard")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("sends LUD-03's parameters only to another card service", async () => {
    const callbacks = cardRelay(undefined);
    await render(<BoltCardReader invoice={await posInvoice()} />);
    await waitFor(() => expect(callbacks).toHaveLength(1));
    expect([...callbacks[0].searchParams.keys()].sort()).toEqual(["k1", "pr"]);
  });

  it("shows the reason the card's service gave, as it gave it", async () => {
    // The card relay forwards the holder's app's sentence, in the holder's language.
    const reason =
      "Neuer Händler: Der Karteninhaber muss ihn in seiner sattle.me-App freigeben und die Karte erneut vorhalten.";
    refusingCardRelay({ status: "ERROR", reason });
    const onRefusal = jest.fn();
    await render(<BoltCardReader invoice={await posInvoice()} onRefusal={onRefusal} />);
    await waitFor(() =>
      expect(onRefusal).toHaveBeenLastCalledWith({ title: "Card declined", message: reason })
    );
  });

  it("says itself why when the card's service gave no reason", async () => {
    refusingCardRelay({ status: "ERROR", reason: "" });
    const onRefusal = jest.fn();
    await render(<BoltCardReader invoice={await posInvoice()} onRefusal={onRefusal} />);
    await waitFor(() =>
      expect(onRefusal).toHaveBeenLastCalledWith({
        title: "Card declined",
        message:
          "The card's service gave no reason. Present the card again, or have the code scanned."
      })
    );
  });

  it("refuses an amount above what the card's service allows, without asking it", async () => {
    // 10,000 sats at most: the invoice asks 12,000.
    const callbacks = cardRelay(true, 10_000_000);
    const onRefusal = jest.fn();
    await render(<BoltCardReader invoice={await posInvoice()} onRefusal={onRefusal} />);
    await waitFor(() =>
      expect(onRefusal).toHaveBeenLastCalledWith({
        title: "Card declined",
        message: "The amount is outside the card's limits. Have the code scanned."
      })
    );
    expect(callbacks).toHaveLength(0);
  });
});

/** A card relay that refuses the callback with `body` (HTTP 200, a LUD-03 error). */
function refusingCardRelay(body: { status: "ERROR"; reason: string }) {
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const answer =
      url.pathname === "/w"
        ? {
            tag: "withdrawRequest",
            callback: "https://relay.sattle.me/cb/0123456789abcdef0123456789abcdef",
            k1: "a".repeat(64),
            minWithdrawable: 1000,
            maxWithdrawable: 100_000_000_000,
            payeeProof: true
          }
        : body;
    return { ok: true, status: 200, json: async () => answer } as Response;
  });
}
