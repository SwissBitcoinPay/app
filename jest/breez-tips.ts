/**
 * Fake Breez LNURL server (breez.tips) over the tests' fetch, as spark-sdk 0.28.4 serves it: an
 * address's payRequest (`/.well-known/lnurlp/<username>`) carries the metadata of the description
 * the fake SDK registered for it (`lightningAddresses` of jest/breez-sdk.ts: registering the same
 * username again replaces it, as the server's `upsert_user`); the LUD-21 verify URL of an invoice
 * it made (`/lnurlp/verify/<payment hash>`, as the server's code builds it since 0.27.2 and as
 * production serves it: `breezTips.invoices`)
 * answers it whole, any other `{"status":"ERROR","reason":"Not found"}`. Its callback
 * (`/lnurlp/<username>/invoice?amount=…`, LUD-06) makes an invoice of that amount, its description
 * hash the address's metadata, kept in `breezTips.invoices` (`breezTips.minSendableMsat` bounds
 * it, as the payRequest says). `serveBreezTips()`
 * installs it on the global fetch for the test; `breezTips.unreachable` makes it answer nothing,
 * `breezTips.redirect` answers from another URL (a redirect fetch followed).
 */
import { lightningAddresses } from "./breez-sdk";
import { makeInvoice, metadataHash } from "./lightning";

export const breezTips = {
  unreachable: false,
  /** Every URL asked, in order. */
  requests: [] as string[],
  /** The invoices it made, by payment hash: what its verify URL answers. */
  invoices: new Map<string, { pr: string; settled: boolean }>(),
  /** Set: every answer comes from this URL (fetch followed a redirect there). */
  redirect: null as string | null,
  /** The payRequest's smallest amount (msat). */
  minSendableMsat: 1000,
  /** Invoices its callback made: each gets its own payment hash. */
  issued: 0
};

/** Forgets what the server made and how it fails (each test starts afresh). */
export function resetBreezTips(): void {
  breezTips.unreachable = false;
  breezTips.requests = [];
  breezTips.invoices = new Map();
  breezTips.redirect = null;
  breezTips.minSendableMsat = 1000;
  breezTips.issued = 0;
}

/** The verify URL breez.tips gives an invoice it makes (production's path). */
export function breezTipsVerifyUrl(paymentHash: string): string {
  return `https://breez.tips/lnurlp/verify/${paymentHash}`;
}

/** The metadata breez.tips serves for `username` (routes.rs, `get_metadata`). */
export function breezTipsMetadata(username: string, description: string): string {
  return JSON.stringify([
    ["text/plain", description],
    ["text/identifier", `${username}@breez.tips`]
  ]);
}

function json(body: unknown, status = 200, url = ""): Response {
  return {
    ok: status < 400,
    status,
    url: breezTips.redirect ?? url,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

export async function breezTipsFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input));
  breezTips.requests.push(url.toString());
  if (url.host !== "breez.tips" || breezTips.unreachable) {
    throw new TypeError("Network request failed");
  }
  const payRequest = /^\/\.well-known\/lnurlp\/([^/]+)$/.exec(url.pathname);
  const verify = /^\/lnurlp\/verify\/([0-9a-f]{64})$/.exec(url.pathname);
  if (verify) {
    const invoice = breezTips.invoices.get(verify[1]);
    if (!invoice) return json({ status: "ERROR", reason: "Not found" }, 404, url.toString());
    return json(
      { status: "OK", settled: invoice.settled, preimage: null, pr: invoice.pr },
      200,
      url.toString()
    );
  }
  const callback = /^\/lnurlp\/([^/]+)\/invoice$/.exec(url.pathname);
  if (callback) {
    const username = callback[1];
    const description = lightningAddresses.get(username);
    if (description === undefined) return json({ status: "ERROR", reason: "not found" }, 404);
    const amount = url.searchParams.get("amount") ?? "";
    if (!/^\d{1,15}$/.test(amount) || Number(amount) < breezTips.minSendableMsat) {
      return json({ status: "ERROR", reason: "Invalid amount" }, 400);
    }
    breezTips.issued += 1;
    const paymentHash = metadataHash(`breez.tips invoice ${breezTips.issued}`);
    const expiry = url.searchParams.get("expiry");
    const pr = makeInvoice({
      amountMsat: BigInt(amount),
      paymentHash,
      descriptionHash: metadataHash(breezTipsMetadata(username, description)),
      expirySeconds: expiry && /^\d+$/.test(expiry) ? Number(expiry) : undefined
    });
    breezTips.invoices.set(paymentHash, { pr, settled: false });
    return json({ pr, routes: [], verify: breezTipsVerifyUrl(paymentHash) });
  }
  if (payRequest) {
    const username = payRequest[1];
    const description = lightningAddresses.get(username);
    if (description === undefined) return json({ status: "ERROR", reason: "not found" }, 404);
    return json({
      tag: "payRequest",
      callback: `https://breez.tips/lnurlp/${username}/invoice`,
      minSendable: breezTips.minSendableMsat,
      maxSendable: 100_000_000_000,
      metadata: breezTipsMetadata(username, description),
      commentAllowed: 255
    });
  }
  return json({ status: "ERROR", reason: "not found" }, 404);
}

/** Answers the test's fetch as breez.tips; anything else fails as without network. */
export function serveBreezTips(): void {
  resetBreezTips();
  jest.mocked(globalThis.fetch).mockImplementation(breezTipsFetch);
}

/**
 * What a card payment's record keeps of a merchant of breez.tips its point of sale proved
 * (src/lib/card/payment-entry.ts): the invoice of `amountMsat` breez.tips made for `username`, with
 * `paymentHash` (signed by `signWith`, a node's key, else by none), its metadata, its verify URL and
 * that URL's answer, as received.
 */
export function provenCardPayee(
  username: string,
  description: string,
  paymentHash: string,
  { amountMsat = 2_000_000n, signWith }: { amountMsat?: bigint; signWith?: Uint8Array } = {}
): { pr: string; metadata: string; verify: string; verifyAnswer: string } {
  const metadata = breezTipsMetadata(username, description);
  const descriptionHash = metadataHash(metadata);
  const pr = makeInvoice({ amountMsat, paymentHash, descriptionHash, signWith });
  return {
    pr,
    metadata,
    verify: breezTipsVerifyUrl(paymentHash),
    verifyAnswer: JSON.stringify({ status: "OK", settled: false, preimage: null, pr })
  };
}
