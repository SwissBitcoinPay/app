import { fetchPayRequest, LnurlError, normalizeLightningAddress, type LnurlOptions } from "./lnurl";

/*
 * Who a Lightning address pays, from its LUD-06 metadata: the JSON array of `[type, value]` pairs
 * whose SHA-256 is the description hash of every invoice the address gives. The Breez LNURL server
 * (breez.tips, spark-sdk 0.28.4, crates/breez-sdk/lnurl/src/routes.rs `get_metadata`) serves
 * exactly `[["text/plain", <description>], ["text/identifier", "<name>@<domain>"]]`: the
 * description registered with the address (the business name, address-description.ts) and the
 * address itself. Its invoices are signed by Spark's shared nodes, so their node key names no
 * merchant: the address does.
 *
 * Read strictly, as anything served or relayed is untrusted: pairs of strings only, exactly one
 * address and exactly one name. Anything else names no payee.
 */

export type PayeeMetadata = {
  /** `text/identifier`: the Lightning address, trimmed and lowercase. */
  address: string;
  /** `text/plain`: what the address's owner wrote, as served (cleaned at the display edge). */
  name: string;
};

/** The payee `metadata` (a LUD-06 metadata string) names, or null when it is not well formed. */
export function readPayeeMetadata(metadata: string): PayeeMetadata | null {
  let value: unknown;
  try {
    value = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const addresses: string[] = [];
  const names: string[] = [];
  for (const entry of value) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "string"
    ) {
      return null;
    }
    if (entry[0] === "text/identifier") addresses.push(entry[1]);
    else if (entry[0] === "text/plain") names.push(entry[1]);
  }
  if (addresses.length !== 1 || names.length !== 1) return null;
  const address = normalizeLightningAddress(addresses[0]);
  return address ? { address, name: names[0] } : null;
}

/** What an address's LNURL server serves for it: its payee, and its metadata exactly as served. */
export type AddressMetadata = PayeeMetadata & { metadata: string };

/**
 * The metadata `address` is registered with on its LNURL server, read from its payRequest (public,
 * no wallet): the server's word, never the wallet's local copy, which another device may have left
 * stale. Rejects (LnurlError) when the server gives no payRequest of that very address.
 */
export async function fetchAddressMetadata(
  address: string,
  options: LnurlOptions = {}
): Promise<AddressMetadata> {
  const pay = await fetchPayRequest(address, options);
  const payee = readPayeeMetadata(pay.metadata);
  if (!payee || payee.address !== normalizeLightningAddress(address)) {
    throw new LnurlError("invalidResponse", `${address}: metadata of another payee`);
  }
  return { ...payee, metadata: pay.metadata };
}
