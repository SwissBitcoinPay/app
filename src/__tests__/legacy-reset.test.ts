import {
  CardResetError,
  answerCardChallenge,
  identifyCard,
  openCardSession,
  startCardReset,
  wipeCardKeys
} from "@/lib/card/legacy-reset";

/*
 * The client of the v2 server's reset of a v2 card (src/lib/card/legacy-reset.ts): what it sends,
 * and that it takes nothing from an answer out of shape. The protocol itself, through a simulated
 * card and server, is card-migration.test.ts's.
 */

const SESSION = "ab".repeat(32);

type Sent = { url: string; body: unknown };

/** A fetch that answers `status` and `body`, keeping what was sent. */
function server(status: number, body: unknown) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { sent, options: { fetchImpl } };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(CardResetError);
  return (error as CardResetError).code;
}

describe("the v2 card reset client", () => {
  it("sends the tap, and the card expected when there is one, to the v2 server", async () => {
    const { sent, options } = server(200, { session: SESSION });
    await expect(startCardReset({ p: "AA".repeat(16), c: "BB".repeat(8) }, options)).resolves.toBe(
      SESSION
    );
    await startCardReset({ p: "AA".repeat(16), c: "BB".repeat(8), uid: "04aabbccddeeff" }, options);
    expect(sent[0]).toEqual({
      url: "https://api.swiss-bitcoin-pay.ch/v1/card-reset/start",
      body: { p: "AA".repeat(16), c: "BB".repeat(8) }
    });
    expect(sent[1].body).toEqual({ p: "AA".repeat(16), c: "BB".repeat(8), uid: "04aabbccddeeff" });
  });

  it("relays the card's bytes as hex, and reads the server's back as bytes", async () => {
    const challenge = server(200, { answer: "01".repeat(32) });
    await expect(
      answerCardChallenge(SESSION, new Uint8Array(16).fill(0xfe), challenge.options)
    ).resolves.toEqual(new Uint8Array(32).fill(1));
    expect(challenge.sent[0].body).toEqual({ session: SESSION, challenge: "fe".repeat(16) });

    const open = server(200, { command: { ins: 0x51, data: "0A".repeat(8) } });
    await expect(openCardSession(SESSION, new Uint8Array(32), open.options)).resolves.toEqual({
      ins: 0x51,
      data: new Uint8Array(8).fill(10)
    });

    const identify = server(200, { uid: "04AABBCCDDEEFF", closed: true });
    await expect(identifyCard(SESSION, new Uint8Array(24), identify.options)).resolves.toEqual({
      uid: "04aabbccddeeff",
      closed: true
    });
    expect(identify.sent[0].body).toEqual({
      session: SESSION,
      response: "00".repeat(24),
      action: "identify"
    });
  });

  it("takes the wipe's commands only as one to three ChangeKey", async () => {
    const change = { ins: 0xc4, data: "01".repeat(41) };
    const ok = server(200, { uid: "04AABBCCDDEEFF", commands: [change, change, change] });
    const wipe = await wipeCardKeys(SESSION, new Uint8Array(24), ok.options);
    expect(wipe.uid).toBe("04aabbccddeeff");
    expect(wipe.commands).toHaveLength(3);
    for (const commands of [[], [change, change, change, change], [{ ins: 0x5f, data: "01" }]]) {
      const answer = server(200, { uid: "04AABBCCDDEEFF", commands });
      expect(await codeOf(wipeCardKeys(SESSION, new Uint8Array(24), answer.options))).toBe(
        "invalidResponse"
      );
    }
  });

  it("refuses an answer out of shape", async () => {
    const cases: (() => Promise<unknown>)[] = [
      () => startCardReset({ p: "", c: "" }, server(200, { session: "zz" }).options),
      () => answerCardChallenge(SESSION, new Uint8Array(16), server(200, { answer: "01" }).options),
      () =>
        openCardSession(
          SESSION,
          new Uint8Array(32),
          server(200, { command: { ins: 999, data: "01" } }).options
        ),
      () =>
        identifyCard(SESSION, new Uint8Array(24), server(200, { uid: "04AABBCCDDEEFF" }).options),
      () =>
        identifyCard(SESSION, new Uint8Array(24), server(200, { uid: "04", closed: false }).options)
    ];
    for (const call of cases) expect(await codeOf(call())).toBe("invalidResponse");
  });

  it('names the server\'s refusals, and takes anything else for "try again"', async () => {
    const refusals: [number, string, string][] = [
      [403, "card_tap_invalid", "tapInvalid"],
      [404, "card_not_found", "notFound"],
      [403, "card_not_authenticated", "notAuthenticated"],
      [403, "card_response_invalid", "responseInvalid"],
      [403, "card_disabled", "disabled"],
      [409, "card_balance_not_empty", "balanceNotEmpty"],
      [409, "card_payment_pending", "paymentPending"],
      [404, "card_reset_session_not_found", "sessionLost"],
      [503, "card_reset_not_configured", "notConfigured"],
      [503, "card_reset_unavailable", "unavailable"],
      [500, "internal", "unavailable"],
      [429, "anything", "unavailable"]
    ];
    for (const [status, error, code] of refusals) {
      const { options } = server(status, { error });
      expect(await codeOf(startCardReset({ p: "AA".repeat(16), c: "BB".repeat(8) }, options))).toBe(
        code
      );
    }
    // No answer at all.
    const down = {
      fetchImpl: (async () => Promise.reject(new TypeError("offline"))) as typeof fetch
    };
    expect(await codeOf(startCardReset({ p: "AA".repeat(16), c: "BB".repeat(8) }, down))).toBe(
      "unavailable"
    );
  });
});
