import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { identifiedPayeeOf, type CardPaymentEntry } from "@/lib/card/payment-entry";
import { checkPayee, provenAddress, VERIFY_TIMEOUT_MS } from "@/lib/card/payee-proof";

import {
  breezTips,
  breezTipsFetch,
  breezTipsMetadata,
  breezTipsVerifyUrl,
  resetBreezTips
} from "../../jest/breez-tips";
import { makeInvoice, preimagePair, testNode } from "../../jest/lightning";
import { nodeAliases } from "../../jest/node-aliases";

/*
 * The payee of a card payment, from the point of sale's proof: identified only when the metadata
 * names one address and one name, hashes to the invoice's `h`, and the address's own service says,
 * at a verify URL on its domain, that it made this very invoice and that it is not paid yet.
 * Without a proof that holds, by the node that signed the invoice.
 */

const METADATA = breezTipsMetadata("sattleme01", "Lakeside Bakery");
const hashOf = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

/** An invoice of breez.tips for `sattleme01`, as its point of sale joins its proof. */
function issued({
  seed = 1,
  metadata = METADATA,
  hash = hashOf(metadata),
  settled = false,
  known = true
}: {
  seed?: number;
  metadata?: string;
  hash?: string;
  settled?: boolean;
  /** Made by breez.tips: its verify URL knows it. */
  known?: boolean;
} = {}) {
  const { paymentHash } = preimagePair(seed);
  const pr = makeInvoice({ amountMsat: 1_000_000n, paymentHash, descriptionHash: hash });
  if (known) breezTips.invoices.set(paymentHash, { pr, settled });
  return {
    // Signed by no key (jest/lightning.ts): no node to fall back to.
    invoice: { pr, descriptionHash: hash, payeeNode: null as string | null },
    proof: { metadata, verify: breezTipsVerifyUrl(paymentHash) },
    paymentHash
  };
}

const options = { fetchImpl: breezTipsFetch as typeof fetch };

beforeEach(() => resetBreezTips());

describe("the payee of a card payment", () => {
  it("is identified by its address, with the name it declared and the proof as received", async () => {
    const { invoice, proof } = issued();
    const check = await checkPayee(invoice, proof, options);
    expect(check).toEqual({
      status: "identified",
      payee: {
        by: "address",
        id: "sattleme01@breez.tips",
        name: "Lakeside Bakery",
        metadata: METADATA,
        verify: proof.verify,
        verifyAnswer: JSON.stringify({
          status: "OK",
          settled: false,
          preimage: null,
          pr: invoice.pr
        })
      }
    });
    // Asked directly, at the URL the point of sale gave (never rebuilt: production's path).
    expect(breezTips.requests).toEqual([proof.verify]);
  });

  it("compares the invoice as BOLT11 does, case and spaces aside", async () => {
    const { invoice, proof, paymentHash } = issued();
    breezTips.invoices.set(paymentHash, { pr: ` ${invoice.pr.toUpperCase()} `, settled: false });
    await expect(checkPayee(invoice, proof, options)).resolves.toMatchObject({
      status: "identified"
    });
  });

  it("is not identified without a proof, asking nothing", async () => {
    const { invoice, proof } = issued();
    for (const partial of [
      { metadata: null, verify: proof.verify },
      { metadata: proof.metadata, verify: null }
    ]) {
      await expect(checkPayee(invoice, partial, options)).resolves.toEqual({
        status: "unidentified",
        reason: "noProof",
        verifyAnswer: null
      });
    }
    expect(breezTips.requests).toEqual([]);
  });

  it("is not identified from metadata out of shape", async () => {
    for (const metadata of [
      "not json",
      JSON.stringify({ "text/plain": "x" }),
      JSON.stringify([["text/plain", "A"]]),
      JSON.stringify([
        ["text/identifier", "a@breez.tips"],
        ["text/identifier", "b@breez.tips"],
        ["text/plain", "A"]
      ]),
      JSON.stringify([
        ["text/identifier", "a@breez.tips"],
        ["text/plain", "A"],
        ["text/plain", "B"]
      ]),
      JSON.stringify([
        ["text/identifier", "not an address"],
        ["text/plain", "A"]
      ]),
      JSON.stringify([
        ["text/identifier", "a@breez.tips", "x"],
        ["text/plain", "A"]
      ])
    ]) {
      const { invoice, proof } = issued({ metadata });
      await expect(checkPayee(invoice, proof, options)).resolves.toMatchObject({
        status: "unidentified",
        reason: "metadata"
      });
    }
    expect(breezTips.requests).toEqual([]);
  });

  it("is not identified when the metadata's SHA-256 is not the invoice's hash", async () => {
    // The merchant's metadata on an invoice made for other metadata (the relay's own).
    const own = breezTipsMetadata("relay", "Relay");
    const { invoice } = issued({ metadata: own });
    const { proof } = issued({ seed: 2 });
    await expect(checkPayee(invoice, { ...proof }, options)).resolves.toMatchObject({
      status: "unidentified",
      reason: "hash"
    });
    // The same metadata formatted again: other bytes, another hash.
    const spaced = JSON.stringify(JSON.parse(METADATA), null, 1);
    const reformatted = issued({ seed: 3 });
    await expect(
      checkPayee(reformatted.invoice, { ...reformatted.proof, metadata: spaced }, options)
    ).resolves.toMatchObject({ status: "unidentified", reason: "hash" });
    // An invoice with a plain description has no hash.
    await expect(
      checkPayee({ ...reformatted.invoice, descriptionHash: null }, reformatted.proof, options)
    ).resolves.toMatchObject({ status: "unidentified", reason: "hash" });
    expect(breezTips.requests).toEqual([]);
  });

  it("is not identified from a verify URL off the address's domain, or not plain https", async () => {
    const { invoice, proof, paymentHash } = issued();
    const path = `/lnurlp/verify/${paymentHash}`;
    for (const verify of [
      `https://relay.example.com${path}`,
      `https://breez.tips.example.com${path}`,
      `https://sub.breez.tips${path}`,
      `http://breez.tips${path}`,
      `https://breez.tips:8443${path}`,
      `https://user:pass@breez.tips${path}`,
      `https://user@breez.tips${path}`,
      "not a url"
    ]) {
      await expect(checkPayee(invoice, { ...proof, verify }, options)).resolves.toMatchObject({
        status: "unidentified",
        reason: "verifyUrl"
      });
    }
    expect(breezTips.requests).toEqual([]);
  });

  it("is not identified when the service redirects the request elsewhere", async () => {
    const { invoice, proof } = issued();
    breezTips.redirect = "https://relay.example.com/verify";
    await expect(checkPayee(invoice, proof, options)).resolves.toEqual({
      status: "unidentified",
      reason: "redirected",
      verifyAnswer: null
    });
  });

  it('is not identified when the service did not make the invoice ("Not found")', async () => {
    // A relay's own invoice with the merchant's public metadata and `h` copied.
    const { invoice, proof } = issued({ known: false });
    await expect(checkPayee(invoice, proof, options)).resolves.toEqual({
      status: "unidentified",
      reason: "notIssued",
      verifyAnswer: JSON.stringify({ status: "ERROR", reason: "Not found" })
    });
  });

  it("is refused when the service made another invoice, or says it is paid", async () => {
    const other = issued();
    const { invoice: shown } = issued({ seed: 2, known: false });
    // The verify URL of the merchant's invoice, joined to another invoice with its metadata.
    await expect(checkPayee(shown, other.proof, options)).resolves.toMatchObject({
      status: "refused",
      reason: "otherInvoice"
    });
    const paid = issued({ seed: 3, settled: true });
    await expect(checkPayee(paid.invoice, paid.proof, options)).resolves.toMatchObject({
      status: "refused",
      reason: "settled"
    });
  });

  it("is not identified when the service does not answer in time, or out of shape", async () => {
    const { invoice, proof } = issued();
    breezTips.unreachable = true;
    await expect(checkPayee(invoice, proof, options)).resolves.toMatchObject({
      status: "unidentified",
      reason: "unreachable"
    });

    jest.useFakeTimers();
    try {
      const never = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
          })
      );
      const pending = checkPayee(invoice, proof, { fetchImpl: never as unknown as typeof fetch });
      await jest.advanceTimersByTimeAsync(VERIFY_TIMEOUT_MS);
      await expect(pending).resolves.toMatchObject({
        status: "unidentified",
        reason: "unreachable"
      });
    } finally {
      jest.useRealTimers();
    }
    expect(VERIFY_TIMEOUT_MS).toBe(5000);

    const answering = (status: number, text: string) =>
      (async () =>
        ({ status, url: proof.verify, text: async () => text }) as Response) as typeof fetch;
    for (const [status, text, reason] of [
      [503, "{}", "unreachable"],
      [429, "{}", "unreachable"],
      [200, "<html>", "answer"],
      [200, "[]", "answer"],
      [200, JSON.stringify({ status: "OK" }), "answer"],
      [200, JSON.stringify({ status: "ok", pr: invoice.pr }), "answer"],
      [200, JSON.stringify({ status: "OK", pr: invoice.pr, pad: "x".repeat(5000) }), "answer"]
    ] as const) {
      await expect(
        checkPayee(invoice, proof, { fetchImpl: answering(status, text) })
      ).resolves.toMatchObject({ status: "unidentified", reason });
    }
  });

  it("is its invoice's node when no proof holds, the proof's reason aside", async () => {
    const node = testNode(5);
    const { invoice, proof } = issued();
    const signed = { ...invoice, payeeNode: node.nodeId };
    // A private node announces no alias (jest/node-aliases.ts).
    const byNode = {
      status: "identified",
      payee: { by: "node", id: node.nodeId, name: null, verifyAnswer: null }
    };
    // No proof (another point of sale), a proof out of shape, the service out of reach.
    await expect(checkPayee(signed, { metadata: null, verify: null }, options)).resolves.toEqual(
      byNode
    );
    await expect(checkPayee(signed, { ...proof, metadata: "not json" }, options)).resolves.toEqual(
      byNode
    );
    breezTips.unreachable = true;
    await expect(checkPayee(signed, proof, options)).resolves.toEqual(byNode);
    breezTips.unreachable = false;
    // A proof that holds names the address, whoever signed: its node's alias is never asked.
    nodeAliases.asked = [];
    await expect(checkPayee(signed, proof, options)).resolves.toMatchObject({
      status: "identified",
      payee: { by: "address", id: "sattleme01@breez.tips" }
    });
    expect(nodeAliases.asked).toEqual([]);
  });

  it("names a node by the alias it announces, as mempool.space tells it", async () => {
    const node = testNode(5);
    nodeAliases.aliases.set(node.nodeId, "LNBank");
    const { invoice } = issued();
    await expect(
      checkPayee({ ...invoice, payeeNode: node.nodeId }, { metadata: null, verify: null }, options)
    ).resolves.toEqual({
      status: "identified",
      payee: { by: "node", id: node.nodeId, name: "LNBank", verifyAnswer: null }
    });
    expect(nodeAliases.asked).toEqual([node.nodeId]);
    // mempool.space out of reach: still its node, its name unknown.
    nodeAliases.down = true;
    await expect(
      checkPayee({ ...invoice, payeeNode: node.nodeId }, { metadata: null, verify: null }, options)
    ).resolves.toMatchObject({ status: "identified", payee: { by: "node", name: null } });
  });

  it("keeps the service's answer of a proof that did not hold, its node then the payee", async () => {
    const node = testNode(5);
    // A relay's own invoice with the merchant's metadata and `h`: breez.tips does not know it.
    const { invoice, proof } = issued({ known: false });
    await expect(
      checkPayee({ ...invoice, payeeNode: node.nodeId }, proof, options)
    ).resolves.toEqual({
      status: "identified",
      payee: {
        by: "node",
        id: node.nodeId,
        name: null,
        verifyAnswer: JSON.stringify({ status: "ERROR", reason: "Not found" })
      }
    });
  });

  it("is refused whatever node signed, when the service says another invoice or paid", async () => {
    const node = testNode(5);
    const paid = issued({ settled: true });
    await expect(
      checkPayee({ ...paid.invoice, payeeNode: node.nodeId }, paid.proof, options)
    ).resolves.toMatchObject({ status: "refused", reason: "settled" });
  });
});

describe("a kept proof, checked again (a payment's record)", () => {
  it("proves the address as at the payment, from the service's answer kept", async () => {
    const { invoice, proof } = issued();
    const check = await checkPayee(invoice, proof, options);
    if (check.status !== "identified" || check.payee.by !== "address")
      throw new Error("Not proven");
    const kept = { ...proof, verifyAnswer: check.payee.verifyAnswer };
    expect(provenAddress(invoice, kept)).toEqual({
      address: "sattleme01@breez.tips",
      name: "Lakeside Bakery"
    });
    // Nothing asked of the service again.
    expect(breezTips.requests).toEqual([proof.verify]);
    // An answer missing, about another invoice, saying it is paid or not found; other metadata,
    // another URL: proves nothing.
    for (const changed of [
      { ...kept, verifyAnswer: null },
      { ...kept, verifyAnswer: JSON.stringify({ status: "OK", pr: "lnbc1other" }) },
      { ...kept, verifyAnswer: JSON.stringify({ status: "OK", pr: invoice.pr, settled: true }) },
      { ...kept, verifyAnswer: JSON.stringify({ status: "ERROR", reason: "Not found" }) },
      { ...kept, metadata: breezTipsMetadata("relay", "Relay") },
      { ...kept, verify: "https://relay.example.com/verify" }
    ]) {
      expect(provenAddress(invoice, changed)).toBeNull();
    }
    expect(provenAddress({ ...invoice, descriptionHash: null }, kept)).toBeNull();
  });

  it("tells a record's address from its node, the proof kept either way", async () => {
    const node = testNode(6);
    const pr = makeInvoice({
      amountMsat: 1_000_000n,
      paymentHash: preimagePair(1).paymentHash,
      descriptionHash: hashOf(METADATA),
      signWith: node.secretKey
    });
    const record = (verifyAnswer: string | null): CardPaymentEntry => ({
      id: "a1",
      cardId: "0123456789abcdef0123456789abcdef",
      walletGeneration: 1,
      at: 0,
      amountSats: 1_000n,
      paymentHash: preimagePair(1).paymentHash,
      description: null,
      outcome: "sent",
      reason: null,
      pr,
      payee: {
        status: "new",
        name: null,
        metadata: METADATA,
        verify: breezTipsVerifyUrl(preimagePair(1).paymentHash),
        verifyAnswer
      },
      preimage: null,
      value: null
    });
    expect(identifiedPayeeOf(record(JSON.stringify({ status: "OK", settled: false, pr })))).toEqual(
      { by: "address", id: "sattleme01@breez.tips", name: "Lakeside Bakery" }
    );
    // The service out of reach then: its node, though the metadata names an address.
    expect(identifiedPayeeOf(record(null))).toEqual({ by: "node", id: node.nodeId, name: null });
  });
});
