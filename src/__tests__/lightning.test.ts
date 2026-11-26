import { secp256k1 } from "@noble/curves/secp256k1.js";

import { decodeBech32, wordsToBytes } from "@/lib/lightning/bech32";
import {
  bolt11ExpiresAt,
  bolt11PayeeNode,
  decodeBolt11,
  decodeSignedBolt11
} from "@/lib/lightning/bolt11";
import {
  LnurlError,
  MAX_PROOF_METADATA_LENGTH,
  MAX_PROOF_VERIFY_LENGTH,
  fetchPayRequest,
  fetchWithdrawRequest,
  paidPreimage,
  lightningAddressUrl,
  lnurlToUrl,
  normalizeLightningAddress,
  requestInvoice,
  sendableSats,
  submitWithdraw,
  type Invoice,
  type PayRequest
} from "@/lib/lightning/lnurl";
import { fetchAddressMetadata, readPayeeMetadata } from "@/lib/lightning/metadata";

import {
  bytesToWords,
  encodeBech32,
  encodeLnurl,
  makeInvoice,
  metadataHash,
  preimagePair,
  testNode
} from "../../jest/lightning";

/** Test vector of BOLT11 ("Please make a donation of any amount…", 2500u, 1 cup coffee). */
const SPEC_INVOICE =
  "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh";

describe("BOLT11 decoding", () => {
  it("reads the fields of the specification's test vector", () => {
    expect(decodeBolt11(SPEC_INVOICE)).toEqual({
      network: "bc",
      amountMsat: 250_000_000n,
      timestamp: 1496314658,
      expirySeconds: 60,
      paymentHash: "0001020304050607080900010203040506070809000102030405060708090102",
      descriptionHash: null,
      description: "1 cup coffee"
    });
  });

  it("reads a plain description as written, and none beside a description hash", () => {
    const { paymentHash } = preimagePair(1);
    const described = makeInvoice({
      amountMsat: 1000n,
      paymentHash,
      description: "Kaffee Zürich ☕"
    });
    expect(decodeBolt11(described)?.description).toBe("Kaffee Zürich ☕");
    const hashed = makeInvoice({ amountMsat: 1000n, paymentHash, descriptionHash: paymentHash });
    expect(decodeBolt11(hashed)).toMatchObject({ description: null, descriptionHash: paymentHash });
  });

  it("accepts upper case and a lightning: prefix, never mixed case", () => {
    expect(decodeBolt11(`LIGHTNING:${SPEC_INVOICE.toUpperCase()}`)?.amountMsat).toBe(250_000_000n);
    expect(decodeBolt11(`lightning:${SPEC_INVOICE}`)?.timestamp).toBe(1496314658);
    expect(decodeBolt11(`L${SPEC_INVOICE.slice(1)}`)).toBeNull();
  });

  it("refuses a damaged invoice", () => {
    const damaged = SPEC_INVOICE.slice(0, 40) + "q" + SPEC_INVOICE.slice(41);
    expect(damaged).not.toBe(SPEC_INVOICE);
    expect(decodeBolt11(damaged)).toBeNull();
    expect(decodeBolt11("bitcoin:bc1qxyz")).toBeNull();
  });

  it("reads every amount multiplier exactly, and refuses sub-millisatoshi amounts", () => {
    const { paymentHash } = preimagePair(1);
    for (const msat of [100_000_000_000n, 2_000_000_000n, 1_000_000n, 24_100n, 1_000n, 1n]) {
      expect(decodeBolt11(makeInvoice({ amountMsat: msat, paymentHash }))?.amountMsat).toBe(msat);
    }
    expect(decodeBolt11(makeInvoice({ paymentHash }))?.amountMsat).toBeNull();
    // 1 pico-bitcoin is a tenth of a millisatoshi.
    const invalid = makeInvoice({ amountMsat: 1n, paymentHash }).replace("lnbc10p", "lnbc11p");
    expect(decodeBolt11(invalid)).toBeNull();
  });

  it("gives the expiry, one hour when the invoice does not say", () => {
    const { paymentHash } = preimagePair(1);
    const invoice = decodeBolt11(makeInvoice({ paymentHash, timestamp: 1_800_000_000 }));
    expect(invoice?.expirySeconds).toBe(3600);
    expect(bolt11ExpiresAt(invoice!)).toBe(1_800_003_600);
    expect(
      decodeBolt11(makeInvoice({ paymentHash, timestamp: 1_800_000_000, expirySeconds: 600 }))
        ?.expirySeconds
    ).toBe(600);
  });
});

/** The node of the specification's test vectors. */
const SPEC_NODE = "03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad";
/** BOLT11's "Public-key recovery with high-S signature" (readers must accept it). */
const SPEC_HIGH_S_INVOICE =
  "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap2r09nt4ndd0unm3z9u5t48y6ucv4r5sg7lk98c77ctvjczkspk5qprc90gx";
/** BOLT11's "Same, but with an `n` field of invalid length". */
const SPEC_BAD_NODE_FIELD_INVOICE =
  "lnbc25m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5vdhkven9v5sxyetpdeessp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9q5sqqqqqqqqqqqqqqqqsgqnp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqf9dt6rzhc3ynq3u7axf4xc3zaw3fy2kyqal6n86nh5j3lhgcutdjzhvswudd5l8ay9acgrrpd2e6vw9sdqxq6dzq983sgt7dpxk5wacqacdc2y";
/** A real invoice of breez.tips (src/__tests__/fixtures/checkout-spec/app.json, `realInvoice`): with an `n`. */
const BREEZ_TIPS_INVOICE =
  "lnbc210n1p4vvsmgpp5mpepfjvqftecc5jg50t6j7pa929spkv30zwx04xj9jql8qhh9qussp5r7d725tw2vf7345mtmuuypcsav4sh2qp6663qxs2al3q8855qwxqxqzurnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjqwghf7zxvfkxq5a6sr65g0gdkv768p83mhsnt0msszapamzx2qvuxqqqqrt49lmtcqqqqqqqqqqq86qq9qcqzpuhp5gs8l6ck7jdsa9qx8u2ydgl6q933mn2047j5nw9f9xeknle3ujltq9qyyssqsjvk6t43cmgncdn8z783r2gym2u80dh5xa2xmw2u0a9aykhww3z9tdj4m5kvxt6yme90c0g0gauf008hr70lx5jdkzfzn7hwa73axxsqy9rcwv";
/** The Spark service provider's node that signed it. */
const BREEZ_TIPS_NODE = "030936e7a016fb3f5ce53c8db29da2b6dfbf8e068ea058c363e0fd77f444270d8a";

/** `invoice` with its signature's words given by `change` (data part unchanged). */
function withSignature(invoice: string, change: (signature: Uint8Array) => Uint8Array): string {
  const { hrp, words } = decodeBech32(invoice)!;
  const signature = change(wordsToBytes(words.slice(words.length - 104)));
  return encodeBech32(hrp, [...words.slice(0, words.length - 104), ...bytesToWords(signature)]);
}

/** The same signature with s = n − s (high-S) and the other recovery id: it signs the same. */
function highS(signature: Uint8Array): Uint8Array {
  const { r, s } = secp256k1.Signature.fromBytes(signature.slice(0, 64), "compact");
  const flipped = new secp256k1.Signature(r, secp256k1.Point.Fn.ORDER - s).toBytes("compact");
  return Uint8Array.from([...flipped, signature[64] ^ 1]);
}

describe("the node a BOLT11 invoice pays (bolt11PayeeNode)", () => {
  const { paymentHash } = preimagePair(1);

  it("recovers the specification's node, high-S signatures included", () => {
    expect(bolt11PayeeNode(SPEC_INVOICE)).toBe(SPEC_NODE);
    expect(bolt11PayeeNode(`lightning:${SPEC_INVOICE.toUpperCase()}`)).toBe(SPEC_NODE);
    // Accepted: the specification names no node for this one (its recovery id is the low-S
    // signature's, so it recovers another key than SPEC_NODE).
    expect(bolt11PayeeNode(SPEC_HIGH_S_INVOICE)).toMatch(/^0[23][0-9a-f]{64}$/);
  });

  it("checks a real breez.tips invoice against its n field: Spark's shared node", () => {
    expect(bolt11PayeeNode(BREEZ_TIPS_INVOICE)).toBe(BREEZ_TIPS_NODE);
  });

  it("reads the node that signed, with or without an n field", () => {
    const { secretKey, nodeId } = testNode(7);
    const signed = makeInvoice({ amountMsat: 21_000n, paymentHash, signWith: secretKey });
    expect(bolt11PayeeNode(signed)).toBe(nodeId);
    const named = makeInvoice({
      amountMsat: 21_000n,
      paymentHash,
      signWith: secretKey,
      withNodeField: true
    });
    expect(decodeBolt11(named)?.amountMsat).toBe(21_000n);
    expect(bolt11PayeeNode(named)).toBe(nodeId);
  });

  it("refuses a high-S signature against an n field, and accepts it when recovered", () => {
    const { secretKey, nodeId } = testNode(7);
    const invoice = (withNodeField: boolean) =>
      makeInvoice({ amountMsat: 21_000n, paymentHash, signWith: secretKey, withNodeField });
    expect(bolt11PayeeNode(withSignature(invoice(true), highS))).toBeNull();
    expect(bolt11PayeeNode(withSignature(invoice(false), highS))).toBe(nodeId);
  });

  it("reads the invoice once: its fields as decodeBolt11, and the node that signed it", () => {
    const signed = decodeSignedBolt11(SPEC_INVOICE)!;
    expect(signed.invoice).toEqual(decodeBolt11(SPEC_INVOICE));
    expect(signed.signer()).toBe(SPEC_NODE);
    // Worked out once, then kept.
    expect(signed.signer()).toBe(SPEC_NODE);
    // An `n` field of the wrong length names no node; the invoice is read all the same.
    expect(decodeSignedBolt11(SPEC_BAD_NODE_FIELD_INVOICE)?.invoice).toEqual(
      decodeBolt11(SPEC_BAD_NODE_FIELD_INVOICE)
    );
    expect(decodeSignedBolt11(SPEC_BAD_NODE_FIELD_INVOICE)?.signer()).toBeNull();
    expect(decodeSignedBolt11("bitcoin:bc1qxyz")).toBeNull();
  });

  it("names no node for an invoice no key signed", () => {
    expect(bolt11PayeeNode(makeInvoice({ amountMsat: 21_000n, paymentHash }))).toBeNull();
    expect(bolt11PayeeNode(SPEC_BAD_NODE_FIELD_INVOICE)).toBeNull();
    // A recovery id out of 0..3.
    expect(
      bolt11PayeeNode(
        withSignature(SPEC_INVOICE, (sig) => Uint8Array.from([...sig.slice(0, 64), 4]))
      )
    ).toBeNull();
    expect(bolt11PayeeNode("bitcoin:bc1qxyz")).toBeNull();
  });

  it("never names the signer for an invoice changed after it signed", () => {
    const signer = testNode(7);
    const signed = makeInvoice({
      amountMsat: 21_000n,
      paymentHash,
      descriptionHash: paymentHash,
      signWith: signer.secretKey
    });
    // Another description hash under the same signature: another key, or none.
    const { hrp, words } = decodeBech32(signed)!;
    const changed = encodeBech32(
      hrp,
      words.map((word, i) => (i === 70 ? word ^ 1 : word))
    );
    expect(decodeBolt11(changed)).not.toBeNull();
    expect(bolt11PayeeNode(changed)).not.toBe(signer.nodeId);
    // An n field naming another node than the one that signed.
    const other = testNode(8);
    const forged = makeInvoice({
      amountMsat: 21_000n,
      paymentHash,
      signWith: other.secretKey,
      withNodeField: true
    });
    const { words: forgedWords } = decodeBech32(forged)!;
    const swapped = encodeBech32(hrp, [
      ...forgedWords.slice(0, forgedWords.length - 104),
      ...words.slice(words.length - 104)
    ]);
    expect(bolt11PayeeNode(swapped)).toBeNull();
  });
});

const METADATA =
  '[["text/plain","Merchant 9EE5"],["text/identifier","sattleme02c6047f94@breez.tips"]]';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** A fetch answering per URL prefix; anything else fails like a network error. */
function fakeFetch(routes: Record<string, (url: URL) => unknown>) {
  // `init` is kept in the calls, for the tests that read it.
  return jest.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    for (const [prefix, answer] of Object.entries(routes)) {
      if (url.toString().startsWith(prefix)) return jsonResponse(answer(url));
    }
    throw new TypeError("Network request failed");
  });
}

const payRequest: PayRequest = {
  callback: new URL("https://breez.tips/lnurlp/sattleme02c6047f94/invoice"),
  minSendableMsat: 1_000n,
  maxSendableMsat: 4_000_000_000n,
  metadata: METADATA,
  commentAllowed: 255
};

describe("LNURL-pay to a Lightning address", () => {
  it("finds the endpoint of a Lightning address (LUD-16)", () => {
    expect(lightningAddressUrl("sattleme02c6047f94@breez.tips")).toBe(
      "https://breez.tips/.well-known/lnurlp/sattleme02c6047f94"
    );
    expect(lightningAddressUrl(" Shop@Breez.Tips ")).toBe(
      "https://breez.tips/.well-known/lnurlp/shop"
    );
    expect(lightningAddressUrl("not an address")).toBeNull();
    expect(lightningAddressUrl("a@localhost")).toBeNull();
  });

  it("reads the pay parameters, and refuses an answer that is not a payRequest", async () => {
    const fetchImpl = fakeFetch({
      "https://breez.tips/.well-known/lnurlp/sattleme02c6047f94": () => ({
        tag: "payRequest",
        callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
        minSendable: 1000,
        maxSendable: 4000000000,
        metadata: METADATA,
        commentAllowed: 255
      }),
      "https://breez.tips/.well-known/lnurlp/withdraw": () => ({ tag: "withdrawRequest" }),
      "https://breez.tips/.well-known/lnurlp/gone": () => ({ status: "ERROR", reason: "not found" })
    });

    const pay = await fetchPayRequest("sattleme02c6047f94@breez.tips", { fetchImpl });
    expect(pay).toEqual(payRequest);
    expect(sendableSats(pay)).toEqual({ min: 1n, max: 4_000_000n });

    await expect(fetchPayRequest("withdraw@breez.tips", { fetchImpl })).rejects.toMatchObject({
      code: "invalidResponse"
    });
    await expect(fetchPayRequest("gone@breez.tips", { fetchImpl })).rejects.toMatchObject({
      code: "service",
      reason: "not found"
    });
    await expect(fetchPayRequest("offline@breez.tips", { fetchImpl })).rejects.toMatchObject({
      code: "network"
    });
  });

  it("reads a refusal sent with an HTTP error status as the service's answer", async () => {
    const fetchImpl = jest.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("https://breez.tips/refused")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ status: "ERROR", reason: "Amount out of range" })
        } as Response;
      }
      if (String(input).startsWith("https://breez.tips/busy")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ status: "ERROR", reason: "Try again later" })
        } as Response;
      }
      return {
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        }
      } as unknown as Response;
    });
    const ask = (callback: string) =>
      requestInvoice(
        { ...payRequest, callback: new URL(callback) },
        { amountSats: 1n, network: "bc" },
        { fetchImpl }
      );

    await expect(ask("https://breez.tips/refused")).rejects.toMatchObject({
      code: "service",
      reason: "Amount out of range"
    });
    await expect(ask("https://breez.tips/down")).rejects.toMatchObject({ code: "network" });
    // A server error stays a passing failure, even with an LNURL error body.
    await expect(ask("https://breez.tips/busy")).rejects.toMatchObject({ code: "network" });
  });

  it("rounds the service's millisatoshi bounds inwards to whole sats", () => {
    expect(
      sendableSats({ ...payRequest, minSendableMsat: 1_001n, maxSendableMsat: 9_999n })
    ).toEqual({ min: 2n, max: 9n });
  });

  function invoiceService(build: (url: URL) => Record<string, unknown>) {
    return fakeFetch({ "https://breez.tips/lnurlp/sattleme02c6047f94/invoice": build });
  }

  it("asks for an invoice of exactly the amount, with the note and the expiry", async () => {
    const { paymentHash } = preimagePair(7);
    let asked: URL | null = null;
    const fetchImpl = invoiceService((url) => {
      asked = url;
      return {
        pr: makeInvoice({
          amountMsat: 46_918_000n,
          paymentHash,
          descriptionHash: metadataHash(METADATA),
          expirySeconds: 600
        }),
        verify: `https://breez.tips/verify/${paymentHash}`
      };
    });

    const invoice = await requestInvoice(
      payRequest,
      { amountSats: 46_918n, comment: " Table 12 ", expirySeconds: 600, network: "bc" },
      { fetchImpl }
    );

    expect(asked!.searchParams.get("amount")).toBe("46918000");
    expect(asked!.searchParams.get("comment")).toBe("Table 12");
    expect(asked!.searchParams.get("expiry")).toBe("600");
    expect(invoice.decoded.paymentHash).toBe(paymentHash);
    expect(invoice.verifyUrl).toBe(`https://breez.tips/verify/${paymentHash}`);
    // The metadata as served, never formatted again: its SHA-256 is the description hash.
    expect(invoice.metadata).toBe(METADATA);
  });

  it("leaves out a comment the service does not accept", async () => {
    const { paymentHash } = preimagePair(7);
    let asked: URL | null = null;
    const fetchImpl = invoiceService((url) => {
      asked = url;
      return {
        pr: makeInvoice({
          amountMsat: 1_000n,
          paymentHash,
          descriptionHash: metadataHash(METADATA)
        }),
        verify: `https://breez.tips/verify/${paymentHash}`
      };
    });
    await requestInvoice(
      { ...payRequest, commentAllowed: 3 },
      { amountSats: 1n, comment: "Table 12", network: "bc" },
      { fetchImpl }
    );
    expect(asked!.searchParams.has("comment")).toBe(false);
  });

  it.each([
    ["another amount", { amountMsat: 46_919_000n }],
    ["no amount", { amountMsat: undefined }],
    ["another network", { network: "tb" }],
    ["another description", { descriptionHash: metadataHash("[]") }]
  ])("refuses an invoice with %s", async (_case, change) => {
    const { paymentHash } = preimagePair(7);
    const fetchImpl = invoiceService(() => ({
      pr: makeInvoice({
        amountMsat: 46_918_000n,
        paymentHash,
        descriptionHash: metadataHash(METADATA),
        ...change
      }),
      verify: `https://breez.tips/verify/${paymentHash}`
    }));
    await expect(
      requestInvoice(payRequest, { amountSats: 46_918n, network: "bc" }, { fetchImpl })
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("refuses a service that cannot tell when the invoice is paid (no LUD-21)", async () => {
    const { paymentHash } = preimagePair(7);
    const fetchImpl = invoiceService(() => ({
      pr: makeInvoice({ amountMsat: 1_000n, paymentHash, descriptionHash: metadataHash(METADATA) })
    }));
    await expect(
      requestInvoice(payRequest, { amountSats: 1n, network: "bc" }, { fetchImpl })
    ).rejects.toBeInstanceOf(LnurlError);
  });
});

describe("LUD-21 verify", () => {
  const { preimage, paymentHash } = preimagePair(9);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA)
  });
  const invoice = {
    pr,
    decoded: decodeBolt11(pr)!,
    verifyUrl: `https://breez.tips/lnurlp/verify/${paymentHash}`
  };
  const answer = (body: unknown) => ({
    fetchImpl: fakeFetch({ "https://breez.tips/lnurlp/verify/": () => body })
  });

  it("counts a payment as made only with the preimage of the payment hash", async () => {
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: false, preimage: null, pr }))
    ).resolves.toBeNull();
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: true, preimage, pr }))
    ).resolves.toBe(preimage);
    // As some services write it: the proof is kept in lowercase.
    await expect(
      paidPreimage(
        invoice,
        answer({ status: "OK", settled: true, preimage: preimage.toUpperCase(), pr })
      )
    ).resolves.toBe(preimage);
    await expect(
      paidPreimage(
        invoice,
        answer({ status: "OK", settled: true, preimage: preimagePair(10).preimage, pr })
      )
    ).rejects.toMatchObject({ code: "invalidResponse" });
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: true, preimage: null, pr }))
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("only takes the service's word on the very invoice it made under that hash", async () => {
    // The invoice the service made under that hash: 1 sat, to someone else (another breez.tips
    // user: breez.tips serves every user's invoices under one verify path).
    const real = makeInvoice({ amountMsat: 1_000n, paymentHash, descriptionHash: "ab".repeat(32) });
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: true, preimage, pr: real }))
    ).rejects.toMatchObject({ code: "otherInvoice" });
    // Even unpaid: it can never be paid to the service, under that hash.
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: false, preimage: null, pr: real }))
    ).rejects.toMatchObject({ code: "otherInvoice" });
    // An answer that names no invoice proves nothing (LUD-21 requires it).
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: true, preimage }))
    ).rejects.toMatchObject({ code: "invalidResponse" });
    // The same invoice, written in upper case (BOLT11 is case-insensitive).
    await expect(
      paidPreimage(invoice, answer({ status: "OK", settled: true, preimage, pr: pr.toUpperCase() }))
    ).resolves.toBe(preimage);
  });

  // A declared invoice's verify URL is only checked to be on the address's LNURL server: its path
  // is the declarer's. Through a redirect of that server, a page of the declarer's would answer
  // "settled" with the preimage of an invoice the declarer made itself.
  it("asks fetch not to follow a redirect, and other LNURL requests as before", async () => {
    const fetchImpl = fakeFetch({
      "https://breez.tips/lnurlp/verify/": () => ({ status: "OK", settled: true, preimage, pr })
    });
    await expect(paidPreimage(invoice, { fetchImpl })).resolves.toBe(preimage);
    expect(fetchImpl).toHaveBeenCalledWith(
      invoice.verifyUrl,
      expect.objectContaining({ redirect: "error" })
    );
    const lookup = fakeFetch({
      "https://breez.tips/.well-known/lnurlp/": () => ({
        tag: "payRequest",
        callback: payRequest.callback.toString(),
        minSendable: 1000,
        maxSendable: 4_000_000_000,
        metadata: METADATA
      })
    });
    await fetchPayRequest("sattleme02c6047f94@breez.tips", { fetchImpl: lookup });
    expect(lookup.mock.calls[0]?.[1]).not.toHaveProperty("redirect");
  });

  it("never takes an answer that came through a redirect: a failure, checked again later", async () => {
    // A fetch that followed the redirect all the same: its "settled" answer, however well formed,
    // proves nothing.
    const followed = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          redirected: true,
          json: async () => ({ status: "OK", settled: true, preimage, pr })
        }) as Response
    );
    await expect(paidPreimage(invoice, { fetchImpl: followed })).rejects.toMatchObject({
      code: "network"
    });
    // One that refused it (as fetch does with `redirect: "error"`): never "paid" nor "unpaid".
    const refused = jest.fn(async () => {
      throw new TypeError("Redirect is not allowed when redirect mode is 'error'");
    });
    await expect(paidPreimage(invoice, { fetchImpl: refused })).rejects.toMatchObject({
      code: "network"
    });
  });
});

describe("LNURL-withdraw (BoltCards)", () => {
  it("reads the URL of a card's LNURL in its usual forms", () => {
    expect(lnurlToUrl("lnurlw://card.example.com/ln?p=AB&c=CD")?.toString()).toBe(
      "https://card.example.com/ln?p=AB&c=CD"
    );
    expect(lnurlToUrl(encodeLnurl("https://card.example.com/w?k1=1"))?.toString()).toBe(
      "https://card.example.com/w?k1=1"
    );
    expect(lnurlToUrl(`lightning:${encodeLnurl("https://card.example.com/w")}`)?.host).toBe(
      "card.example.com"
    );
    expect(lnurlToUrl("https://card.example.com/w")?.host).toBe("card.example.com");
    expect(lnurlToUrl("http://card.example.com/w")).toBeNull();
    expect(lnurlToUrl("lnurlw://abc.onion/w")).toBeNull();
    expect(lnurlToUrl("hello")).toBeNull();
  });

  it("asks the card's service to pay the invoice, within the card's limits", async () => {
    const { paymentHash } = preimagePair(3);
    const pr = makeInvoice({ amountMsat: 46_918_000n, paymentHash });
    const invoice = { pr, decoded: decodeBolt11(pr)!, verifyUrl: "https://breez.tips/verify/x" };
    let callback: URL | null = null;
    const fetchImpl = fakeFetch({
      "https://card.example.com/ln": () => ({
        tag: "withdrawRequest",
        callback: "https://card.example.com/cb?card=1",
        k1: "abc",
        minWithdrawable: 1000,
        maxWithdrawable: 100_000_000,
        defaultDescription: "BoltCard"
      }),
      "https://card.example.com/cb": (url) => {
        callback = url;
        return { status: "OK" };
      }
    });

    const withdraw = await fetchWithdrawRequest(new URL("https://card.example.com/ln?p=1"), {
      fetchImpl
    });
    await submitWithdraw(withdraw, invoice, { fetchImpl });

    expect(withdraw.payeeProof).toBe(false);
    expect(callback!.searchParams.get("card")).toBe("1");
    expect(callback!.searchParams.get("k1")).toBe("abc");
    expect(callback!.searchParams.get("pr")).toBe(pr);
    // A service that did not ask for the payee's proof gets LUD-03's parameters only.
    expect([...callback!.searchParams.keys()].sort()).toEqual(["card", "k1", "pr"]);

    // Above what the card's service allows: refused here, never as the service's own words.
    const asked = callback;
    await expect(
      submitWithdraw({ ...withdraw, maxWithdrawableMsat: 1_000_000n }, invoice, { fetchImpl })
    ).rejects.toMatchObject({ code: "outOfRange", reason: null });
    expect(callback).toBe(asked);
  });

  it("passes on the card service's refusal", async () => {
    const { paymentHash } = preimagePair(3);
    const pr = makeInvoice({ amountMsat: 1_000n, paymentHash });
    const invoice = { pr, decoded: decodeBolt11(pr)!, verifyUrl: "https://breez.tips/verify/x" };
    const fetchImpl = fakeFetch({
      "https://card.example.com/cb": () => ({ status: "ERROR", reason: "Card disabled" })
    });
    await expect(
      submitWithdraw(
        {
          callback: new URL("https://card.example.com/cb"),
          k1: "abc",
          minWithdrawableMsat: 0n,
          maxWithdrawableMsat: 10_000n,
          payeeProof: false,
          fields: {}
        },
        invoice,
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: "service", reason: "Card disabled" });
  });
});

describe("the payee's proof joined to a card payment (card relay's payeeProof)", () => {
  // What a merchant may write: `+`, spaces, accents, quotes and characters outside the BMP.
  const NAME = 'Kaffee “Zürich” + Tee 🍵 "No.1"';
  const metadata = JSON.stringify([
    ["text/plain", NAME],
    ["text/identifier", "sattleme02c6047f94@breez.tips"]
  ]);
  const { paymentHash } = preimagePair(5);
  const pr = makeInvoice({
    amountMsat: 2_500_000n,
    paymentHash,
    descriptionHash: metadataHash(metadata)
  });
  const verifyUrl = `https://breez.tips/lnurlp/verify/${paymentHash}`;
  const invoice: Invoice = { pr, decoded: decodeBolt11(pr)!, verifyUrl, metadata };

  function cardService(withdraw: Record<string, unknown>) {
    const asked: URL[] = [];
    const fetchImpl = fakeFetch({
      "https://card.example.com/w": () => ({
        tag: "withdrawRequest",
        callback: "https://card.example.com/cb/0123",
        k1: "k".repeat(64),
        minWithdrawable: 1000,
        maxWithdrawable: 100_000_000,
        defaultDescription: "Card payment",
        ...withdraw
      }),
      "https://card.example.com/cb/": (url) => {
        asked.push(url);
        return { status: "OK" };
      }
    });
    return { fetchImpl, asked };
  }

  async function pay(withdrawFields: Record<string, unknown>, paid: Invoice = invoice) {
    const { fetchImpl, asked } = cardService(withdrawFields);
    const withdraw = await fetchWithdrawRequest(new URL("https://card.example.com/w?p=1&c=2"), {
      fetchImpl
    });
    await submitWithdraw(withdraw, paid, { fetchImpl });
    return { withdraw, callback: asked[0]! };
  }

  it("is joined when the card's service asks for it, the strings restored exactly", async () => {
    const { withdraw, callback } = await pay({ payeeProof: true });
    expect(withdraw.payeeProof).toBe(true);
    expect(callback.searchParams.get("k1")).toBe("k".repeat(64));
    expect(callback.searchParams.get("pr")).toBe(pr);
    expect(callback.searchParams.get("metadata")).toBe(metadata);
    expect(callback.searchParams.get("verify")).toBe(verifyUrl);
    // As URLSearchParams writes it, which the card relay reads back unchanged (its own tests): a
    // `+` as %2B, a space as `+`.
    expect(callback.search).toContain("%2B");
  });

  it("is never sent to a service that did not ask for it, or not with `true`", async () => {
    for (const fields of [{}, { payeeProof: "true" }, { payeeProof: 1 }, { payeeProof: false }]) {
      const { withdraw, callback } = await pay(fields);
      expect(withdraw.payeeProof).toBe(false);
      expect(callback.searchParams.has("metadata")).toBe(false);
      expect(callback.searchParams.has("verify")).toBe(false);
      expect(callback.searchParams.get("pr")).toBe(pr);
    }
  });

  it("is left out when longer than the relay takes, never cut", async () => {
    // Metadata of `length` characters (the card holder's app judges its shape, not this side).
    const atBound = (length: number) => `["${"x".repeat(length - 4)}"]`;
    expect(atBound(MAX_PROOF_METADATA_LENGTH)).toHaveLength(MAX_PROOF_METADATA_LENGTH);
    const longest = await pay({ payeeProof: true }, { ...invoice, metadata: atBound(1024) });
    expect(longest.callback.searchParams.get("metadata")).toBe(atBound(1024));
    const tooLong = await pay({ payeeProof: true }, { ...invoice, metadata: atBound(1025) });
    expect(tooLong.callback.searchParams.has("metadata")).toBe(false);
    expect(tooLong.callback.searchParams.has("verify")).toBe(false);
    expect(tooLong.callback.searchParams.get("pr")).toBe(pr);

    const verifyAt = (length: number) =>
      `https://breez.tips/lnurlp/verify/${"a".repeat(length - "https://breez.tips/lnurlp/verify/".length)}`;
    expect(verifyAt(MAX_PROOF_VERIFY_LENGTH)).toHaveLength(MAX_PROOF_VERIFY_LENGTH);
    const longestVerify = await pay({ payeeProof: true }, { ...invoice, verifyUrl: verifyAt(512) });
    expect(longestVerify.callback.searchParams.get("verify")).toBe(verifyAt(512));
    const verifyTooLong = await pay({ payeeProof: true }, { ...invoice, verifyUrl: verifyAt(513) });
    expect(verifyTooLong.callback.searchParams.has("metadata")).toBe(false);
    expect(verifyTooLong.callback.searchParams.has("verify")).toBe(false);
  });

  it("is not sent for an invoice read back without its metadata", async () => {
    const { metadata: _metadata, ...readBack } = invoice;
    const { callback } = await pay({ payeeProof: true }, readBack);
    expect(callback.searchParams.has("metadata")).toBe(false);
    expect(callback.searchParams.has("verify")).toBe(false);
  });
});

describe("the payee a Lightning address's metadata names", () => {
  it("reads the Breez LNURL server's metadata: the address and its name", () => {
    expect(readPayeeMetadata(METADATA)).toEqual({
      address: "sattleme02c6047f94@breez.tips",
      name: "Merchant 9EE5"
    });
    // As served on breez.tips, other entries (an image) allowed.
    expect(
      readPayeeMetadata(
        '[["text/plain","Pay to breez@breez.tips"],["text/identifier"," Breez@Breez.Tips "],["image/png;base64","iVBOR"]]'
      )
    ).toEqual({ address: "breez@breez.tips", name: "Pay to breez@breez.tips" });
    expect(normalizeLightningAddress(" Breez@Breez.Tips ")).toBe("breez@breez.tips");
  });

  it("names no payee for metadata out of shape", () => {
    const cases = [
      "not json",
      "{}",
      "[]",
      '[["text/plain","A"]]',
      '[["text/identifier","a@b.example"]]',
      '[["text/plain","A"],["text/identifier","a@b.example"],["text/identifier","c@b.example"]]',
      '[["text/plain","A"],["text/plain","B"],["text/identifier","a@b.example"]]',
      '[["text/plain","A"],["text/identifier","not an address"]]',
      '[["text/plain","A"],["text/identifier","a@localhost"]]',
      '[["text/plain",1],["text/identifier","a@b.example"]]',
      '[["text/plain","A","B"],["text/identifier","a@b.example"]]',
      '[["text/plain","A"],["text/identifier","a@b.example"],"x"]',
      '[["text/plain","A"],["text/identifier","a@b.example"],null]'
    ];
    for (const metadata of cases) expect(readPayeeMetadata(metadata)).toBeNull();
  });

  it("reads the metadata an address is registered with on its server, from its payRequest", async () => {
    const payRequestOf = (metadata: string) => () => ({
      tag: "payRequest",
      callback: "https://breez.tips/lnurlp/x/invoice",
      minSendable: 1000,
      maxSendable: 1000000,
      metadata
    });
    const fetchImpl = fakeFetch({
      "https://breez.tips/.well-known/lnurlp/sattleme02c6047f94": payRequestOf(METADATA),
      "https://breez.tips/.well-known/lnurlp/other": payRequestOf(METADATA),
      "https://breez.tips/.well-known/lnurlp/bad": payRequestOf("[]"),
      "https://breez.tips/.well-known/lnurlp/gone": () => ({ status: "ERROR", reason: "not found" })
    });
    // Exactly as served: an invoice's description hash is its SHA-256.
    await expect(
      fetchAddressMetadata("SATTLEME02c6047f94@breez.tips", { fetchImpl })
    ).resolves.toEqual({
      address: "sattleme02c6047f94@breez.tips",
      name: "Merchant 9EE5",
      metadata: METADATA
    });
    // Metadata of another address, or out of shape, or no address at all: never a payee.
    for (const address of ["other@breez.tips", "bad@breez.tips"]) {
      await expect(fetchAddressMetadata(address, { fetchImpl })).rejects.toMatchObject({
        code: "invalidResponse"
      });
    }
    await expect(fetchAddressMetadata("gone@breez.tips", { fetchImpl })).rejects.toMatchObject({
      code: "service"
    });
    await expect(fetchAddressMetadata("offline@breez.tips", { fetchImpl })).rejects.toMatchObject({
      code: "network"
    });
  });
});
