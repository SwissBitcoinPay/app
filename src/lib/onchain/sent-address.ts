import { Address, NETWORK } from "@scure/btc-signer";

/*
 * Apart from address.ts and sdk-read.ts: the iOS extension's engine bundles both, with @noble's
 * packages only (extension-engine.test.ts, card-payment-core.test.ts). Read by the app's wallet
 * layers alone (wallet.ts, wallet.web.ts).
 */

/** Longest segwit address (BIP-173). */
const MAX_ADDRESS_LENGTH = 90;

/**
 * The Bitcoin address a withdrawal of the wallet paid (the SDK's `destinationAddress`), as the app
 * shows it: a mainnet address of a type @scure/btc-signer decodes (P2PKH, P2SH, P2WPKH, P2WSH,
 * P2TR), its checksum checked; a segwit one in lowercase, as explorers print it. Null for anything
 * else (an empty value, another network, a future witness version): then no address is shown,
 * never one not proven.
 */
export function parseSentAddress(address: string): string | null {
  if (address.length === 0 || address.length > MAX_ADDRESS_LENGTH) return null;
  let decoded: { type?: string };
  try {
    decoded = Address(NETWORK).decode(address);
  } catch {
    return null;
  }
  switch (decoded.type) {
    case "pkh":
    case "sh":
      return address;
    case "wpkh":
    case "wsh":
    case "tr":
      return address.toLowerCase();
    default:
      return null;
  }
}
