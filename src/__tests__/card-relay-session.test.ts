import { cleanDescription, readCardInvoice } from "@/lib/card/card-invoice";
import { RelaySessionError, openRelaySession, relaySessionUrl } from "@/lib/card/relay-session";

import { makeInvoice, preimagePair, testNode } from "../../jest/lightning";

const WAKE = {
  relay: "relay.sattle.me",
  session: "ab".repeat(16),
  wsToken: "cd".repeat(16)
};
const K1 = "ef".repeat(32);

/** One socket, driven by hand (the relay's side). */
function fakeSocket() {
  const socket = {
    readyState: 0,
    sent: [] as string[],
    closed: false,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.closed = true;
    }
  };
  const urls: string[] = [];
  const createSocket = (url: string) => {
    urls.push(url);
    return socket as unknown as WebSocket;
  };
  return {
    socket,
    urls,
    createSocket,
    open: () => {
      socket.readyState = 1;
      socket.onopen?.();
    },
    push: (data: unknown) => socket.onmessage?.({ data }),
    shut: () => {
      socket.readyState = 3;
      socket.onclose?.();
    }
  };
}

describe("a tap's session on the relay (WebSocket)", () => {
  it("connects to the session with its token, reads the invoice, answers once", async () => {
    const fake = fakeSocket();
    const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
    expect(fake.urls).toEqual([`wss://relay.sattle.me/wait/${WAKE.session}?t=${WAKE.wsToken}`]);
    fake.open();
    expect(session.isWaiting()).toBe(true);
    // No answer before the invoice: the relay would ignore it.
    expect(session.answer({ ok: false, reason: "declined" })).toBe(false);
    fake.push(JSON.stringify({ pr: "lnbc1xyz", k1: K1 }));
    await expect(session.invoice).resolves.toEqual({
      pr: "lnbc1xyz",
      k1: K1,
      metadata: null,
      verify: null,
      waitMs: null
    });
    // Later messages are not invoices: ignored.
    fake.push(JSON.stringify({ pr: "lnbc1other", k1: K1 }));
    expect(session.answer({ ok: true })).toBe(true);
    expect(session.answer({ ok: false, reason: "declined" })).toBe(false);
    expect(fake.socket.sent).toEqual(['{"ok":true}']);
    expect(session.isWaiting()).toBe(false);
    const ended = jest.fn();
    session.onEnd(ended);
    fake.shut();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('hands the session over (`{"hold":true}`, then closed), once nothing was answered', async () => {
    // After the invoice.
    const fake = fakeSocket();
    const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
    fake.open();
    fake.push(JSON.stringify({ pr: "lnbc1xyz", k1: K1 }));
    await session.invoice;
    const ended = jest.fn();
    session.onEnd(ended);
    expect(session.handOver()).toBe(true);
    expect(fake.socket.sent).toEqual(['{"hold":true}']);
    expect(fake.socket.closed).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(session.isWaiting()).toBe(false);
    expect(session.handOver()).toBe(false);
    expect(session.answer({ ok: true })).toBe(false);
    // Before it: the invoice never comes to this socket.
    const early = fakeSocket();
    const before = openRelaySession(WAKE, { createSocket: early.createSocket });
    early.open();
    expect(before.handOver()).toBe(true);
    await expect(before.invoice).rejects.toBeInstanceOf(RelaySessionError);
    // Never once answered, nor before the socket is open.
    const answered = fakeSocket();
    const paid = openRelaySession(WAKE, { createSocket: answered.createSocket });
    expect(paid.handOver()).toBe(false);
    answered.open();
    answered.push(JSON.stringify({ pr: "lnbc1xyz", k1: K1 }));
    await paid.invoice;
    expect(paid.answer({ ok: true })).toBe(true);
    expect(paid.handOver()).toBe(false);
    expect(answered.socket.sent).toEqual(['{"ok":true}']);
  });

  it("ends on a first message that is not an invoice", async () => {
    for (const message of [
      "not json",
      JSON.stringify([1]),
      JSON.stringify({ pr: "lnbc1xyz" }),
      JSON.stringify({ pr: "lnbc1xyz", k1: "short" }),
      JSON.stringify({ pr: "x".repeat(2049), k1: K1 }),
      JSON.stringify({ pr: 7, k1: K1 }),
      "x".repeat(5000),
      // Longer than any message the relay sends (its fields at their bounds, escaped at worst).
      JSON.stringify({ pr: "lnbc1xyz", k1: K1, pad: "x".repeat(16_400) })
    ]) {
      const fake = fakeSocket();
      const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
      fake.open();
      fake.push(message);
      await expect(session.invoice).rejects.toMatchObject({ code: "malformed" });
      expect(fake.socket.closed).toBe(true);
    }
  });

  it("reads the payee's proof the point of sale joined, within the relay's bounds only", async () => {
    const metadata = JSON.stringify([
      ["text/plain", "Kaffee “Ünïcode” +"],
      ["text/identifier", "sattleme01@breez.tips"]
    ]);
    const verify = "https://breez.tips/lnurlp/verify/" + "a".repeat(64);
    const read = async (message: Record<string, unknown>) => {
      const fake = fakeSocket();
      const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
      fake.open();
      fake.push(JSON.stringify({ pr: "lnbc1xyz", k1: K1, ...message }));
      return session.invoice;
    };
    // As received, never formatted again: its hash is the invoice's (payee-proof.ts).
    await expect(read({ metadata, verify })).resolves.toEqual({
      pr: "lnbc1xyz",
      k1: K1,
      metadata,
      verify,
      waitMs: null
    });
    // Out of the relay's bounds, or not strings: absent, the invoice still read.
    for (const proof of [
      { metadata: "", verify: "" },
      { metadata: "m".repeat(1025), verify: "v".repeat(513) },
      { metadata: ["text/plain"], verify: 7 }
    ]) {
      await expect(read(proof)).resolves.toEqual({
        pr: "lnbc1xyz",
        k1: K1,
        metadata: null,
        verify: null,
        waitMs: null
      });
    }
    // At their bounds: kept, the message still read whole.
    const escaped = "\u00fc".repeat(1024);
    const fake = fakeSocket();
    const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
    fake.open();
    fake.push(
      `{"pr":"lnbc1xyz","k1":"${K1}","metadata":"${escaped}","verify":"${"v".repeat(512)}"}`
    );
    await expect(session.invoice).resolves.toMatchObject({
      metadata: "ü".repeat(1024),
      verify: "v".repeat(512)
    });
  });

  it("reads how long the point of sale still waits (relay 2.1.0), never a value out of shape", async () => {
    const read = async (message: Record<string, unknown>) => {
      const fake = fakeSocket();
      const session = openRelaySession(WAKE, { createSocket: fake.createSocket });
      fake.open();
      fake.push(JSON.stringify({ pr: "lnbc1xyz", k1: K1, ...message }));
      return (await session.invoice).waitMs;
    };
    await expect(read({ waitMs: 64_980 })).resolves.toBe(64_980);
    await expect(read({ waitMs: 0 })).resolves.toBe(0);
    // Longer tells nothing more: bounded, the phone answers within its minute anyway.
    await expect(read({ waitMs: 3_600_000 })).resolves.toBe(600_000);
    // Not the relay's wait: as a relay that says nothing (the answer's time of before).
    for (const waitMs of [-1, 1.5, "65000", null, [65_000], Number.MAX_SAFE_INTEGER + 2]) {
      await expect(read({ waitMs })).resolves.toBeNull();
    }
    await expect(read({})).resolves.toBeNull();
  });

  it("tells a refused session from one the relay ended", async () => {
    const refused = fakeSocket();
    const first = openRelaySession(WAKE, { createSocket: refused.createSocket });
    refused.socket.onerror?.();
    await expect(first.invoice).rejects.toMatchObject({ code: "unreachable" });

    const ended = fakeSocket();
    const second = openRelaySession(WAKE, { createSocket: ended.createSocket });
    ended.open();
    ended.shut();
    await expect(second.invoice).rejects.toMatchObject({ code: "closed" });
    expect(second.answer({ ok: true })).toBe(false);

    const failing = openRelaySession(WAKE, {
      createSocket: () => {
        throw new Error("No network");
      }
    });
    await expect(failing.invoice).rejects.toBeInstanceOf(RelaySessionError);
  });

  it("stops waiting for the invoice after the session's lifetime", async () => {
    jest.useFakeTimers();
    try {
      const fake = fakeSocket();
      const session = openRelaySession(WAKE, {
        createSocket: fake.createSocket,
        invoiceTimeoutMs: 60_000
      });
      fake.open();
      jest.advanceTimersByTime(60_000);
      await expect(session.invoice).rejects.toMatchObject({ code: "timeout" });
      expect(fake.socket.closed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a session that a wake packet could not have given", () => {
    expect(() => relaySessionUrl({ ...WAKE, relay: "card.example.com/evil" })).toThrow();
    expect(() => relaySessionUrl({ ...WAKE, session: "AB".repeat(16) })).toThrow();
    expect(() => relaySessionUrl({ ...WAKE, wsToken: "a?b=c&d=efghijklmnopqrstu" })).toThrow();
  });
});

describe("the point of sale's invoice", () => {
  const now = Math.floor(Date.now() / 1000);
  const options = { network: "bc", maxSats: 100_000n, nowSeconds: now };
  const invoice = (
    amountMsat: bigint | undefined,
    more: Partial<Parameters<typeof makeInvoice>[0]> = {}
  ) =>
    makeInvoice({ amountMsat, paymentHash: preimagePair(1).paymentHash, timestamp: now, ...more });

  it("reads a whole amount within the ceiling, and the description as the point of sale wrote it", () => {
    const pr = invoice(12_500_000n, { description: "Whole\u202e  wheat\n" });
    expect(readCardInvoice(pr, options)).toEqual({
      ok: true,
      invoice: {
        pr,
        amountSats: 12_500n,
        paymentHash: preimagePair(1).paymentHash,
        descriptionHash: null,
        description: "Whole wheat",
        expiresAt: now + 3600,
        // Signed by no key (jest/lightning.ts).
        payeeNode: null
      }
    });
    const node = testNode(3);
    expect(
      readCardInvoice(invoice(12_500_000n, { signWith: node.secretKey }), options)
    ).toMatchObject({ ok: true, invoice: { payeeNode: node.nodeId } });
    expect(readCardInvoice(invoice(100_000_000n), options)).toMatchObject({ ok: true });
    // The relay's highest bound, 1 BTC, for a card set as high.
    expect(
      readCardInvoice(invoice(100_000_000_000n), { ...options, maxSats: 100_000_000n })
    ).toMatchObject({ ok: true });
  });

  it("refuses what the wallet must not pay", () => {
    // Out of the relay's bounds (1 sat to 1 BTC), whatever the card's ceiling.
    expect(
      readCardInvoice(invoice(100_000_001_000n), { ...options, maxSats: 200_000_000n })
    ).toEqual({
      ok: false,
      issue: "outOfBounds"
    });
    expect(readCardInvoice(invoice(12_000_000n), { ...options, maxSats: 10_000n })).toEqual({
      ok: false,
      issue: "aboveLimit"
    });
    expect(readCardInvoice(invoice(undefined), options)).toEqual({ ok: false, issue: "noAmount" });
    expect(readCardInvoice(invoice(1_500n), options)).toEqual({ ok: false, issue: "noAmount" });
    expect(readCardInvoice(invoice(1_000n, { network: "tb" }), options)).toEqual({
      ok: false,
      issue: "otherNetwork"
    });
    expect(
      readCardInvoice(invoice(1_000n, { timestamp: now - 600, expirySeconds: 600 }), options)
    ).toEqual({ ok: false, issue: "expired" });
    expect(readCardInvoice("lnbc1nope", options)).toEqual({ ok: false, issue: "malformed" });
    expect(readCardInvoice(42, options)).toEqual({ ok: false, issue: "malformed" });
    expect(readCardInvoice(`lnbc${"q".repeat(2050)}`, options)).toEqual({
      ok: false,
      issue: "malformed"
    });
  });

  it("shows a description on one line, without hidden characters, cut when too long", () => {
    expect(cleanDescription("  \u0000\u2066 ")).toBeNull();
    expect(cleanDescription("a\tb\r\nc")).toBe("a b c");
    const long = cleanDescription("ü".repeat(200));
    expect(Array.from(long!)).toHaveLength(140);
    expect(long!.endsWith("…")).toBe(true);
  });
});
