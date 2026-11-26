// breez.tips, the merchant's Lightning address, for the store screenshots (capture.mjs): what the
// page asks it is answered here, as the server does (spark-sdk 0.28.4, as jest/breez-tips.ts
// describes it): the address's payRequest (LUD-06/16), its callback making an invoice of the
// amount asked whose description hash is the metadata's, and the LUD-21 verify URL of each
// invoice made, which tells it settled, with its preimage, once the capture paid it (`settle`).
// The invoices are the tests' (jest/lightning.ts): a fictitious payment hash, no node signature.
const { makeInvoice, metadataHash, preimagePair } = require("../../jest/lightning.ts");

const HOST = "breez.tips";

/** The payRequest's bounds (msat), as the server's. */
const MIN_SENDABLE_MSAT = 1000;
const MAX_SENDABLE_MSAT = 100_000_000_000;

/** The metadata breez.tips serves for `username` (as jest/breez-tips.ts, routes.rs). */
function metadataOf(username, description) {
  return JSON.stringify([
    ["text/plain", description],
    ["text/identifier", `${username}@${HOST}`]
  ]);
}

class FakeBreezTips {
  /**
   * `descriptionOf(username)`: the description the page's wallet registered for that username
   * (undefined: none); `nowSeconds()`: the page's time, which dates the invoices.
   */
  constructor({ descriptionOf, nowSeconds }) {
    this.descriptionOf = descriptionOf;
    this.nowSeconds = nowSeconds;
    /** The invoices made, by payment hash, in order. */
    this.invoices = new Map();
  }

  /** Whether `url` is breez.tips's. */
  static serves(url) {
    return url.protocol === "https:" && url.host === HOST;
  }

  /** The answer to a GET of `url`: { status, body }. */
  async answer(url) {
    const verify = /^\/lnurlp\/verify\/([0-9a-f]{64})$/.exec(url.pathname);
    if (verify) {
      const invoice = this.invoices.get(verify[1]);
      if (!invoice) return { status: 404, body: { status: "ERROR", reason: "Not found" } };
      return {
        status: 200,
        body: {
          status: "OK",
          settled: invoice.settled,
          preimage: invoice.settled ? invoice.preimage : null,
          pr: invoice.pr
        }
      };
    }
    const callback = /^\/lnurlp\/([^/]+)\/invoice$/.exec(url.pathname);
    const payRequest = /^\/\.well-known\/lnurlp\/([^/]+)$/.exec(url.pathname);
    const username = (callback ?? payRequest)?.[1];
    if (username === undefined)
      return { status: 404, body: { status: "ERROR", reason: "not found" } };
    const description = await this.descriptionOf(username);
    if (description === undefined) {
      return { status: 404, body: { status: "ERROR", reason: "not found" } };
    }
    const metadata = metadataOf(username, description);
    if (payRequest) {
      return {
        status: 200,
        body: {
          tag: "payRequest",
          callback: `https://${HOST}/lnurlp/${username}/invoice`,
          minSendable: MIN_SENDABLE_MSAT,
          maxSendable: MAX_SENDABLE_MSAT,
          metadata,
          commentAllowed: 255
        }
      };
    }
    const amount = url.searchParams.get("amount") ?? "";
    if (!/^\d{1,15}$/.test(amount) || Number(amount) < MIN_SENDABLE_MSAT) {
      return { status: 400, body: { status: "ERROR", reason: "Invalid amount" } };
    }
    // A preimage of its own per invoice (32 times one byte: at most 256 invoices).
    const { preimage, paymentHash } = preimagePair(this.invoices.size + 1);
    const expiry = url.searchParams.get("expiry");
    const pr = makeInvoice({
      amountMsat: BigInt(amount),
      paymentHash,
      descriptionHash: metadataHash(metadata),
      timestamp: await this.nowSeconds(),
      expirySeconds: expiry && /^\d+$/.test(expiry) ? Number(expiry) : undefined
    });
    this.invoices.set(paymentHash, {
      pr,
      preimage,
      paymentHash,
      amountMsat: BigInt(amount),
      settled: false
    });
    return {
      status: 200,
      body: { pr, routes: [], verify: `https://${HOST}/lnurlp/verify/${paymentHash}` }
    };
  }

  /** Pays the last invoice made: its verify URL tells it settled, with its preimage, from now. */
  settleLast() {
    const last = [...this.invoices.values()].at(-1);
    if (!last) throw new Error("No invoice made yet");
    last.settled = true;
    return last;
  }
}

module.exports = { FakeBreezTips };
