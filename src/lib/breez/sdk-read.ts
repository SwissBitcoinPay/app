import type { BreezNetwork } from "./config";
import { SendError, WalletError } from "./errors";
import { checkNotExpired, invoiceSats } from "./send-input";
import type { SendDestination, WalletPayment } from "./types";

/*
 * How the app reads what the Breez SDK gives (a payment, a Lightning invoice), whichever build of
 * the SDK gave it: the React Native one (wallet.ts) or the Swift one, in the iOS extension's
 * engine (src/lib/engine/wallet.ts). Each maps its build's objects into these views; the reading
 * itself is one, here.
 */

/** A payment of the SDK (`Payment`, spark-sdk 0.28.4), its enums as names. */
export type SdkPaymentView = {
  id: string;
  type: "send" | "receive";
  status: "completed" | "failed" | "pending";
  amount: bigint;
  fees: bigint;
  /** Unix seconds. */
  timestamp: bigint;
  method: "lightning" | "spark" | "token" | "deposit" | "withdraw" | "unknown";
  details?:
    | {
        tag: "lightning";
        description?: string;
        /** `lnurlPayInfo.lnAddress`. */
        lnAddress?: string;
        /** `lnurlReceiveMetadata.senderComment`. */
        senderComment?: string;
        /** `htlcDetails`. */
        paymentHash: string;
        preimage?: string;
      }
    | { tag: "spark"; /** `invoiceDetails.description`. */ invoiceDescription?: string }
    | { tag: "deposit" | "withdraw"; txId: string }
    | { tag: "token" }
    | { tag: "other" };
};

/** A Lightning invoice the SDK parsed (`Bolt11InvoiceDetails`). */
export type SdkBolt11View = {
  bolt11: string;
  /** Its Bitcoin network (`BitcoinNetwork`): "other" for any but these. */
  network: "bitcoin" | "regtest" | "other";
  amountMsat?: bigint;
  timestamp: bigint;
  expiry: bigint;
  description?: string;
};

/** A `u64` timestamp in seconds as a number: exact up to the year 285 616. */
export function sdkSeconds(timestamp: bigint): number {
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) throw new WalletError("requestFailed", "Invalid timestamp");
  return seconds;
}

/** A preimage as the SDK gives it: 32 bytes in hex, lowercase; undefined otherwise. */
export function preimageOf(value: string | undefined): string | undefined {
  return value !== undefined && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** Throws `otherNetwork` unless `network` is the Bitcoin network of `build` (config.ts). */
export function checkSdkNetwork(network: SdkBolt11View["network"], build: BreezNetwork): void {
  const expected = build === "mainnet" ? "bitcoin" : "regtest";
  if (network !== expected) throw new SendError("otherNetwork", "Another Bitcoin network");
}

/** `payment` as the app reads it; null for a token's (the app moves sats only). */
export function walletPaymentOf(payment: SdkPaymentView): WalletPayment | null {
  const { details } = payment;
  if (payment.method === "token" || details?.tag === "token") return null;
  const read: WalletPayment = {
    id: payment.id,
    direction: payment.type === "send" ? "send" : "receive",
    status: payment.status,
    amountSats: payment.amount,
    feeSats: payment.fees,
    timestamp: sdkSeconds(payment.timestamp),
    network:
      payment.method === "deposit" || payment.method === "withdraw"
        ? "bitcoin"
        : payment.method === "spark"
          ? "spark"
          : payment.method === "lightning"
            ? "lightning"
            : "unknown"
  };
  // A transfer the SDK cannot tell (WalletPayment.network): nothing of its details is proven.
  if (read.network === "unknown") return read;
  const lightning = details?.tag === "lightning" ? details : undefined;
  // Lowercase, as every reader matches it (witnesses, payment links, the owner's copy): a txid in
  // another case would match none.
  const txId =
    details?.tag === "withdraw" || details?.tag === "deposit"
      ? details.txId.toLowerCase()
      : undefined;
  const description =
    lightning?.description ?? (details?.tag === "spark" ? details.invoiceDescription : undefined);
  return {
    ...read,
    description: description || undefined,
    lightningAddress: lightning?.lnAddress || undefined,
    senderComment: lightning?.senderComment || undefined,
    paymentHash: lightning?.paymentHash,
    preimage: preimageOf(lightning?.preimage),
    txId
  };
}

/**
 * `invoice` as a destination of a payment: of the network of `build`, not expired, its amount in
 * whole sats (or none). SendError otherwise.
 */
export function bolt11Destination(invoice: SdkBolt11View, build: BreezNetwork): SendDestination {
  checkSdkNetwork(invoice.network, build);
  const expiresAt = sdkSeconds(invoice.timestamp + invoice.expiry);
  checkNotExpired(expiresAt);
  return {
    kind: "bolt11",
    request: invoice.bolt11,
    amountSats: invoice.amountMsat === undefined ? null : invoiceSats(invoice.amountMsat),
    description: invoice.description || undefined,
    expiresAt
  };
}
