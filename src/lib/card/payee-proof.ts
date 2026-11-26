import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { getWithTimeout } from "@/lib/http";
import { readPayeeMetadata } from "@/lib/lightning/metadata";
import { fetchNodeAlias } from "@/lib/lightning/node-alias";

/*
 * Who a card payment pays: the card holder's app identifies the payee and
 * decides, never the relay, which could hand it an invoice of its own for a genuine tap. The point
 * of sale joins a proof to its invoice (src/lib/lightning/lnurl.ts, submitWithdraw), which the relay
 * forwards unchecked (relay-session.ts): the LUD-06 metadata of the Lightning address that made the
 * invoice, and the invoice's LUD-21 verify URL. The payee is identified only when everything holds,
 * never on one field alone:
 *
 * 1. the invoice was read (card-invoice.ts: network, whole amount, bounds, expiry; its signature is
 *    checked by the wallet before anything is sent, spark-sdk 0.28.4 through lightning-invoice);
 * 2. the metadata names exactly one address and one name (metadata.ts);
 * 3. its SHA-256 (the UTF-8 bytes received, never formatted again) is the invoice's description
 *    hash: an invoice of the relay's own wallet, or of its own address, carries another one;
 * 4. the verify URL is https, without user nor port, on exactly the address's domain: the relay
 *    cannot answer for it with a server of its own;
 * 5. the address's service, asked directly from the phone (never through the relay), within
 *    VERIFY_TIMEOUT_MS, says it made this very invoice (its `pr`) and that it is not paid yet.
 *    breez.tips answers for every invoice it made, whoever's (`verify`, routes.rs): 3 is what ties
 *    the invoice to the address, and the server hashes only metadata naming its own user's address.
 *
 * A verify answer about another invoice, or saying it is paid, is refused outright: the service
 * says the invoice is not the one shown, or that paying it again would pay twice.
 *
 * Without a proof that holds (another point of sale's invoice, the address's service out of reach,
 * a relay removing the proof), the payee is the node its invoice pays: the key that signed it,
 * which the wallet checks again before it pays. A node may be
 * shared by every customer of a service (Spark's for every Spark wallet, breez.tips included; a
 * custodial wallet's), Spark's included: approving one approves anyone it
 * receives for, which the holder is told as they approve it (CardPaymentSheet.tsx). Only an
 * invoice whose signature holds for no key leaves its payee unidentified. Its name is the alias
 * the node announces, as mempool.space tells it (node-alias.ts): asked only then, never for a
 * merchant its address names, and a label only.
 */

/**
 * The phone answers the relay within a minute of the invoice (25 s with a relay of before 2.1.0,
 * src/config/card.ts): 5 s for this.
 */
export const VERIFY_TIMEOUT_MS = 5000;
/** A verify answer is a few hundred bytes: one longer is not read (nor kept as the proof). */
const MAX_VERIFY_ANSWER_LENGTH = 4096;

/** The payee, identified by its Lightning address, else by the node its invoice pays. */
export type IdentifiedPayee =
  | {
      by: "address";
      /** `text/identifier`: the Lightning address, lowercase. Never shown to the holder. */
      id: string;
      /** `text/plain`, as the merchant registered it (cleaned at the display edge). */
      name: string;
      /** The proof, kept with the payment for a dispute (payment-log.ts). */
      metadata: string;
      verify: string;
      /** The service's answer, as received. */
      verifyAnswer: string;
    }
  | {
      by: "node";
      /** The node's public key, compressed, lowercase hex (card-invoice.ts, payeeNode). */
      id: string;
      /**
       * The alias it announces (node-alias.ts), its word only; null when it announces none or it
       * could not be read. Its invoice's signature is the proof (the log keeps `pr`).
       */
      name: string | null;
      /**
       * The address's service's answer, when one was read: the proof that did not hold, kept with
       * the payment as received (payment.ts).
       */
      verifyAnswer: string | null;
    };

export type UnidentifiedReason =
  /** The point of sale gave no proof (another terminal, another card service). */
  | "noProof"
  /** The metadata is not a payee's (metadata.ts). */
  | "metadata"
  /** The metadata is not what the invoice was made for. */
  | "hash"
  /** The verify URL is not on the address's domain, or not plain https. */
  | "verifyUrl"
  /** The service did not answer in time, or answered with an error of its own. */
  | "unreachable"
  /** The service moved the request elsewhere: its answer is not taken. */
  | "redirected"
  /** The service does not know the invoice (breez.tips: "Not found"). */
  | "notIssued"
  /** An answer out of the LUD-21 shape. */
  | "answer";

export type PayeeCheck =
  | { status: "identified"; payee: IdentifiedPayee }
  /**
   * Neither its address nor its node (an invoice no key signed). `reason`: why the proof did not
   * hold; `verifyAnswer`: the service's answer when one was read (kept with the payment).
   */
  | { status: "unidentified"; reason: UnidentifiedReason; verifyAnswer: string | null }
  /** The service says the invoice is another one, or paid already: never paid. */
  | { status: "refused"; reason: "otherInvoice" | "settled"; verifyAnswer: string };

export type PayeeCheckOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

class RedirectedError extends Error {}

/**
 * The invoice's payee: from the point of sale's proof, else the node the invoice pays. Never
 * rejects.
 */
export async function checkPayee(
  invoice: { pr: string; descriptionHash: string | null; payeeNode: string | null },
  proof: { metadata: string | null; verify: string | null },
  options: PayeeCheckOptions = {}
): Promise<PayeeCheck> {
  const byAddress = await checkAddress(invoice, proof, options);
  if (byAddress.status !== "unidentified" || invoice.payeeNode === null) return byAddress;
  // The verify URL's timeout is not the alias's: a label, waited for less (node-alias.ts).
  const name = await fetchNodeAlias(invoice.payeeNode, { fetchImpl: options.fetchImpl });
  const { verifyAnswer } = byAddress;
  return { status: "identified", payee: { by: "node", id: invoice.payeeNode, name, verifyAnswer } };
}

/** The invoice's payee from the point of sale's proof only. Never rejects. */
async function checkAddress(
  invoice: { pr: string; descriptionHash: string | null },
  proof: { metadata: string | null; verify: string | null },
  { fetchImpl = fetch, timeoutMs = VERIFY_TIMEOUT_MS }: PayeeCheckOptions
): Promise<PayeeCheck> {
  const named = offlineChecks(invoice, proof);
  if (typeof named === "string") return unidentified(named);
  const { url } = named;
  let answer: { status: number; text: string };
  try {
    answer = await getWithTimeout(url.href, fetchImpl, timeoutMs, async (response) => {
      // React Native's fetch follows redirects natively, whatever `redirect` says: an answer from
      // elsewhere than the URL asked is not taken (an empty `url`: the runtime does not tell).
      if (response.url && sameUrl(response.url, url) === false) throw new RedirectedError();
      return { status: response.status, text: await response.text() };
    });
  } catch (error) {
    return unidentified(error instanceof RedirectedError ? "redirected" : "unreachable");
  }
  if (answer.status >= 500 || answer.status === 408 || answer.status === 429) {
    return unidentified("unreachable");
  }
  return answered(invoice.pr, named, answer.text);
}

/**
 * Steps 2 to 4 (see above), which need no network: the payee the metadata names and its verify
 * URL, or why the proof does not hold.
 */
function offlineChecks(
  invoice: { descriptionHash: string | null },
  { metadata, verify }: { metadata: string | null; verify: string | null }
):
  | { address: string; name: string; metadata: string; verify: string; url: URL }
  | "noProof"
  | "metadata"
  | "hash"
  | "verifyUrl" {
  if (metadata === null || verify === null) return "noProof";
  const payee = readPayeeMetadata(metadata);
  if (!payee) return "metadata";
  if (
    invoice.descriptionHash === null ||
    invoice.descriptionHash !== bytesToHex(sha256(utf8ToBytes(metadata)))
  ) {
    return "hash";
  }
  const url = verifyUrlOf(verify, payee.address);
  return url ? { ...payee, metadata, verify, url } : "verifyUrl";
}

/** Step 5 on the service's answer `text` (as received) about the invoice `pr`. */
function answered(
  pr: string,
  named: { address: string; name: string; metadata: string; verify: string },
  text: string
): PayeeCheck {
  if (text.length > MAX_VERIFY_ANSWER_LENGTH) return unidentified("answer");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return unidentified("answer", text);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return unidentified("answer", text);
  }
  const json = body as Record<string, unknown>;
  if (typeof json.status === "string" && json.status.toUpperCase() === "ERROR") {
    return unidentified("notIssued", text);
  }
  if (json.status !== "OK" || typeof json.pr !== "string") return unidentified("answer", text);
  // BOLT11 is case-insensitive (bech32), as paidPreimage compares it.
  if (json.pr.trim().toLowerCase() !== pr.trim().toLowerCase()) {
    return { status: "refused", reason: "otherInvoice", verifyAnswer: text };
  }
  if (json.settled === true) return { status: "refused", reason: "settled", verifyAnswer: text };
  return {
    status: "identified",
    payee: {
      by: "address",
      id: named.address,
      name: named.name,
      metadata: named.metadata,
      verify: named.verify,
      verifyAnswer: text
    }
  };
}

/**
 * The address a kept proof proves (a payment's record, payment-entry.ts): the same checks as at
 * the payment, on the service's answer kept as received, without the network. Null when it proves
 * none: the payee was then its invoice's node, or nobody.
 */
export function provenAddress(
  invoice: { pr: string; descriptionHash: string | null },
  kept: { metadata: string | null; verify: string | null; verifyAnswer: string | null }
): { address: string; name: string } | null {
  const named = offlineChecks(invoice, kept);
  if (typeof named === "string" || kept.verifyAnswer === null) return null;
  const check = answered(invoice.pr, named, kept.verifyAnswer);
  return check.status === "identified" && check.payee.by === "address"
    ? { address: check.payee.id, name: check.payee.name }
    : null;
}

function unidentified(reason: UnidentifiedReason, verifyAnswer: string | null = null): PayeeCheck {
  return { status: "unidentified", reason, verifyAnswer };
}

/** The verify URL when it is plain https on exactly the address's domain, else null. */
function verifyUrlOf(verify: string, address: string): URL | null {
  let url: URL;
  try {
    url = new URL(verify);
  } catch {
    return null;
  }
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.hostname === domain
    ? url
    : null;
}

/** Whether `answered` (a response's URL) is `asked`; null when it cannot be read. */
function sameUrl(answered: string, asked: URL): boolean | null {
  try {
    return new URL(answered).href === asked.href;
  } catch {
    return null;
  }
}
