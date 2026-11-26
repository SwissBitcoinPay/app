import { useEffect, useState } from "react";

import { REQUIRED_CONFIRMATIONS, acceptsOnchain } from "@/config/onchain";
import {
  useOnchainPayment,
  type ExplorerChoice,
  type OnchainPayment
} from "@/features/onchain/useOnchainPayment";
import { useOnchainTimes, type SightingsBook } from "@/features/onchain/useOnchainTimes";
import { expectedInvoiceDate, invoiceRequestDelayMs, observeInvoiceDate } from "@/lib/clock";
import { bolt11ExpiresAt } from "@/lib/lightning/bolt11";
import { LnurlError, requestInvoice, sendableSats, type Invoice } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import { HOUR_SECONDS, fetchHourPoints, pointEnd, pointHourOf } from "@/lib/rates/sources";
import {
  checkDeclaredInvoice,
  datedForSale,
  declareInvoice,
  fetchDeclaredInvoices,
  fitsItsPeriod,
  paymentUniqueness,
  type Registry,
  type Uniqueness
} from "@/lib/registry/registry";
import { nowUnix } from "@/lib/rates/snapshot";
import { openAccountFormerMetadata } from "@/lib/settings/former-metadata";
import { coversWith, dueOnchain } from "@/lib/onchain/tolerance";
import { fiatToSats } from "@/lib/terminal/amount";

import {
  EXPIRY_GRACE_SECONDS,
  forgetPayRequest,
  invoiceNetwork,
  payRequestOf,
  useInvoicesWatch,
  type InvoiceProof,
  type WatchedInvoice
} from "./invoice";
import type { OnchainTake, OnchainUnavailable } from "./onchain-pool";

/*
 * A sale of a fiat amount, priced hour by hour: the amount
 * due in sats is the fiat amount at the CoinGecko point of an hour (src/lib/rates/), rounded up to
 * the next whole sat, without margin. A point prices what happens from 5 minutes after its hour to
 * 5 minutes after the next (pointHourOf: from 14:05:00 to 15:04:59, the point of 14:00); below,
 * "the hour" of a time is the hour of the point that prices it. Each Lightning invoice is asked at
 * the point of its hour and ends with that point's period at the latest: at HH:05, a new invoice at
 * the new point, for what is still due. An on-chain payment is due at the point that prices the
 * time its transaction was sent (mempool.space's first sight, or BlockCypher's time near a change
 * of point: src/lib/onchain/broadcast-time.ts). What was received
 * stays counted in sats; what is still due follows the rate: the sale is covered once the sats
 * received reach the amount due at the hour of a payment, or at any hour since until the sale's end.
 *
 * A sale's time never changes: underpaid, its rest is payable until the
 * sale's end, no longer (the same address, an invoice of the rest); past it, the sale stays
 * underpaid, with what was received. A transaction paying its address later still counts, at the
 * point of its own hour: it may complete the sale.
 *
 * Above the most the merchant's Lightning address accepts (its `maxSendable`, read from it, never a
 * fixed ceiling), the hour asks no invoice: the sale is paid
 * on-chain only, to its address, as an integration's order is (docs/integrations.md). Without an
 * address (on-chain payments off, a link made without one, the pool unable to give one), such a sale
 * fails with `limits`, saying why (`onchain`). Below the least it accepts, it fails with `limits`
 * too: nothing else could take so little.
 *
 * Used by the point of sale (useCharge.ts) and by the payer's page of a payment link
 * (useSharedInvoice.ts).
 */

/**
 * Why no on-chain address stands in for Lightning above the service's maximum: `none`, the sale
 * offers no on-chain payment ("On-chain payments" off, a payment link made without an address, a
 * network without an explorer: isOnchainAvailable); otherwise the pool's reason (onchain-pool.ts).
 */
export type OnchainRefusal = "none" | OnchainUnavailable;

export type ChargeFailure =
  /** The service could not be reached: network down. */
  | "network"
  /**
   * The amount is outside what the service accepts: `limits` has the bounds, in sats. Above its
   * maximum, only when no on-chain address can stand in for Lightning (`onchain` says why).
   */
  | "limits"
  /** The service answered something the app refuses to show (wrong amount, no LUD-21…). */
  | "invalid";

/** How a sale was paid: over Lightning, on-chain, or on-chain then its rest over Lightning. */
export type PaymentMethod = "lightning" | "onchain" | "mixed";

/** The fiat amount of a sale, in minor units of `currency` with its `digits`. */
export type SaleFiat = { minor: number; digits: number; currency: string };

/** The point of an hour: what amounts are fixed with during its period (pointHourOf). */
export type HourRate = { hour: number; rate: number };

/**
 * What proves a sale's outcome for the long term, for the final version of its payment link
 * (src/lib/payment-link/final.ts): the Lightning invoices that paid it with their preimages, the
 * transactions that paid its address with when each was sent, and for a paid sale the point that
 * fixed the amount the payments covered.
 */
export type Settlement = {
  /** Expired: nothing was received. Underpaid: less than due, by the sale's end. */
  status: "paid" | "expired" | "underpaid";
  received: bigint;
  /**
   * Paid with less than `due`: the sale's tolerance of on-chain underpayments accepted it
   * (src/lib/onchain/tolerance.ts). False otherwise.
   */
  accepted: boolean;
  /**
   * Paid: the amount due the payments covered, at `point`. Underpaid: the amount due they fell
   * short of (the lowest of their hours), at `point`. Null when expired.
   */
  due: bigint | null;
  point: HourRate | null;
  lightning: { invoice: Invoice; preimage: string }[];
  onchain: {
    address: string;
    transactions: { txid: string; receivedAt: number; sats: bigint }[];
    sats: bigint;
  } | null;
  /**
   * Unix seconds from when the outcome is final: at once for a paid sale; otherwise 3 hours after
   * the end of its last invoice or of the sale (FINAL_DELAY_SECONDS), during which a late payment
   * may still be reported.
   */
  finalFrom: number;
};

/**
 * A transaction that paid the sale's address: the sats it paid, when it was sent (Unix ms,
 * broadcast-time.ts) and its confirmations (0 in the mempool).
 */
export type SaleTransaction = {
  txid: string;
  sats: bigint;
  receivedAt: number;
  confirmations: number;
};

/**
 * A transaction that pays the sale's address, as far as it is confirmed now (0 in the mempool),
 * with when it was sent (Unix ms; null until it is known): the payer's page lists them
 * (src/app/pay.tsx).
 */
export type ConfirmingTransaction = {
  txid: string;
  confirmations: number;
  receivedAt: number | null;
};

/**
 * A payment an underpaid sale received, one "Received" step of its chain card (UnderpaidChain): a
 * transaction that paid its address, with when it was received (Unix ms, as SaleTransaction's;
 * null until it is known), or an invoice paid over Lightning (whose time no proof tells: LUD-21
 * gives none).
 */
export type SaleReceipt =
  | { kind: "onchain"; txid: string; sats: bigint; receivedAt: number | null }
  | { kind: "lightning"; paymentHash: string; sats: bigint };

/**
 * How long after its end an expired sale may still turn out paid: Breez's
 * reference provider keeps an expired invoice 3 hours (EXPIRY_GRACE_SECONDS, invoice.ts).
 */
export const FINAL_DELAY_SECONDS = 3 * 3600;

/**
 * An invoice of the sale made elsewhere: the point of sale's, carried by a payment link of version
 * 1 or 2, or one another device declared for the sale (src/lib/registry/).
 */
export type ExternalInvoice = {
  id: string;
  invoice: Invoice;
  /** The hour of the point it was asked at. */
  hour: number;
  /** Unix seconds (nowUnix, src/lib/clock.ts). */
  expiresAt: number;
  since: number;
};

export type SaleState =
  /** No invoice yet: asked, or waiting for the point of the hour (`waitingForRate`). */
  | { phase: "creating"; waitingForRate: boolean }
  /**
   * The invoice of the hour, for `sats` (the amount due at its point); `address` is the
   * sale's on-chain address, null without one (Lightning only). `endsAt` ends the sale.
   */
  | {
      phase: "open";
      /**
       * Null when the hour's amount is above the most the Lightning address accepts: the sale is
       * then paid on-chain only, to `address` (never null so).
       */
      invoice: Invoice | null;
      /** The hour of the point the invoice was asked at (its amount was fixed at). */
      hour: number;
      sats: bigint;
      /** The invoice's end; on-chain only, the end of its point's period or of the sale. */
      invoiceExpiresAt: number;
      endsAt: number;
      address: string | null;
      /**
       * Why the point of sale's sale has no address although it should have one (onchain-pool.ts,
       * takeOnchainAddress); null with an address, and when none is meant (below MIN_ONCHAIN_SATS,
       * on-chain payments off, an address fixed by the payer's page).
       */
      onchainUnavailable: OnchainUnavailable | null;
    }
  /**
   * Whether the sale was paid is not known yet: an ended invoice still observed (its payment may be
   * reported a little late), an address not read yet, or a payment whose amount due is not known
   * (when it was sent or the point of its hour not read yet). Never "Expired" nor "Underpaid"
   * until it is known; `bitcoin` when the explorers are what is waited for. `paymentSeen`: a payment
   * came (an invoice paid, a transaction), not counted yet; otherwise nothing was received, the
   * sale ended and only a late report is awaited. Before the sale's end, a payment that does not count
   * (another sale declared it, src/lib/registry/; a transaction replaced) lets the sale go on.
   * `lateUntil`: past the sale's end, when what it waits for is a payment of its ended invoices
   * reported late (invoice.ts, EXPIRY_GRACE_SECONDS) or their declarations, until when (Unix
   * seconds, nowUnix) the last of their grace periods lasts; null once none is checked any more,
   * and in the other cases (the point of sale counts it down, charge.tsx). `settling`: a payment
   * came UNIQUENESS_SLOW_SECONDS ago or more, and whether it belongs to this sale only is still not
   * known (the relays not answering, or events published at its address read with difficulty):
   * "Payment received, being checked".
   */
  | {
      phase: "checking";
      bitcoin: boolean;
      paymentSeen: boolean;
      lateUntil: number | null;
      settling: boolean;
    }
  /**
   * Paid on-chain, the network confirms it. `received`: everything paid, the Lightning
   * part of an underpayment's rest included (`method` "mixed").
   */
  | {
      phase: "unconfirmed";
      method: "onchain" | "mixed";
      received: bigint;
      confirmations: number;
      detectedAt: Date;
      /** What pays the address, each as far as it is confirmed. */
      transactions: ConfirmingTransaction[];
    }
  /**
   * Less than due was paid, until the sale's end. `rest` is what the hour's point still
   * asks (null until it is known); `topUp` asks for it over Lightning (null while it is asked, or
   * when the service cannot make one); `address` too, the sale's (null: Lightning only).
   */
  | {
      phase: "underpaid";
      address: string | null;
      received: bigint;
      rest: bigint | null;
      topUp: Invoice | null;
      /** The transactions that paid the address (the sale's records name them, useSaleRecord). */
      txids: string[];
      /** Each payment received, whose sats add up to `received`. */
      receipts: SaleReceipt[];
    }
  /**
   * Past the sale's end, less than due was received: the sale stays so.
   * `due` is what the payments fell short of (the lowest amount due at the hour of the last payment
   * or any hour since, until the sale's end); `lightning` the sats received over Lightning;
   * `transactions` those that paid the address. A transaction received later still counts.
   */
  | {
      phase: "underpaidEnded";
      received: bigint;
      due: bigint;
      lightning: bigint;
      transactions: SaleTransaction[];
    }
  /**
   * `invoice`: the Lightning invoice paid last, null when paid on-chain only. `transactions`: what
   * pays the address, each as far as it is confirmed (one may not be yet when Lightning paid it
   * all: the address is still watched while the screen shows); `onchainConfirmed` once the
   * explorer showed every one of them REQUIRED_CONFIRMATIONS deep (useOnchainPayment's "paid").
   */
  | {
      phase: "paid";
      method: PaymentMethod;
      paidAt: Date;
      received: bigint;
      invoice: Invoice | null;
      transactions: ConfirmingTransaction[];
      onchainConfirmed: boolean;
    }
  /** Nothing was paid in time. */
  | { phase: "expired" }
  /**
   * A payment came that another sale of the business declared too (src/lib/registry/): it counts
   * for none, and the owner settles it with the wallet, which received it once ("Wallet"). Shown
   * instead of what would ask the payer for money or tell that nothing came ("open", "creating",
   * "underpaid", "expired", "underpaidEnded", "failed"), from then on: the payer paid, and anyone
   * holding the registry key can declare a payment it saw for another sale ("Payment to check", no
   * new invoice, the code hidden). Never told before the payment was read on a majority of the
   * relays (paymentUniqueness "conflict"). Display only: the sale's outcome (its settlement, the
   * link's final version) is what it was.
   */
  | { phase: "disputed" }
  | {
      phase: "failed";
      failure: ChargeFailure;
      limits?: { min: bigint; max: bigint };
      /** With `limits`, above their maximum: why no on-chain address stands in for Lightning. */
      onchain?: OnchainRefusal;
    };

/** An invoice this hook asked for: one per hour and amount. */
type Segment = {
  id: string;
  /** Of the whole amount, before any payment, or of the rest of an underpayment. */
  kind: "whole" | "rest";
  hour: number;
  sats: bigint;
  /**
   * Null when none could be made: asked again at `expiresAt`; or, `onchainOnly`, when none is
   * asked (above the service's maximum).
   */
  invoice: Invoice | null;
  /**
   * The whole amount, above the most the service accepts, paid on-chain only this hour: the sale
   * shows its address alone until `expiresAt`.
   */
  onchainOnly?: boolean;
  /**
   * The invoice came, but dated by its issuer outside what was asked (another period, or ending
   * past the period or the sale): this device's clock was off. Not shown, asked again.
   */
  misfit?: boolean;
  since: number;
  /** Unix seconds (src/lib/clock.ts): the invoice's end, or when to ask again. */
  expiresAt: number;
};

type Asked = {
  key: string;
  segments: Segment[];
  /** The address taken with the first invoice (useCharge), null without one; undefined until. */
  address: string | null | undefined;
  /** Why it was taken without an address (OnchainTake), null otherwise. */
  onchainUnavailable: OnchainUnavailable | null;
  failure: Extract<SaleState, { phase: "failed" }> | null;
};

/** What a sale asked nothing for yet holds. */
const askedAfresh = (key: string): Asked => ({
  key,
  segments: [],
  address: undefined,
  onchainUnavailable: null,
  failure: null
});

/** A sale that takes no address: below the on-chain floor (MIN_ONCHAIN_SATS). */
const NO_ADDRESS: OnchainTake = { address: null, unavailable: null };

const NO_DUES: ReadonlyMap<number, bigint> = new Map();
const NO_RATES: ReadonlyMap<number, number> = new Map();

/** A Lightning invoice shorter than this is not asked: the next point's comes soon after. */
const MIN_INVOICE_SECONDS = 30;
/** After a failed request (network, BlockCypher, CoinGecko): asked again this much later. */
const RETRY_SECONDS = 60;
/**
 * An invoice that came dated otherwise than predicted (its end is not exactly the one asked, or it
 * is of another period) is asked again at once, the clock corrected (src/lib/clock.ts), up to this
 * many times in a row for an hour and amount; then MISFIT_RETRY_SECONDS apart (a service whose
 * dates move).
 */
const IMMEDIATE_MISFITS = 5;
const MISFIT_RETRY_SECONDS = 5;
/** How much earlier than the sale's start the transactions recorded for it are read. */
const SIGHTINGS_CLOCK_MARGIN_SECONDS = 300;

/** How often the sale's declarations are read, for the invoices other devices made for it. */
export const DECLARATIONS_INTERVAL_MS = 30_000;
/** Whether a payment belongs to this sale only is asked again this often while not known. */
const UNIQUENESS_RETRY_MS = 30_000;
/**
 * Past this since a payment came, still not known to belong to this sale only, the point of sale
 * says it was received and is being checked (SaleState `settling`), rather than a bare spinner.
 */
export const UNIQUENESS_SLOW_SECONDS = 60;

/** What a disputed payment shows instead of (SaleState "disputed"). */
const DISPUTED_HIDES: ReadonlySet<SaleState["phase"]> = new Set([
  "open",
  "creating",
  "underpaid",
  "underpaidEnded",
  "expired",
  "failed"
]);

function failureOf(error: unknown): ChargeFailure {
  return error instanceof LnurlError && error.code === "network" ? "network" : "invalid";
}

/** Sats a paid invoice brought: its own amount, whole sats (the app only asks whole sats). */
function invoiceSats(invoice: Invoice): bigint {
  return (invoice.decoded.amountMsat ?? 0n) / 1000n;
}

export function useSale({
  key,
  fiat,
  rate,
  startsAt,
  endsAt,
  address: fixedAddress = null,
  takeAddress,
  releaseAddress,
  lightningAddress,
  note,
  own,
  external = [],
  registry = null,
  sightings = null,
  awaitDeclared = false,
  proof = null,
  tolerance = 0,
  explorer = "public",
  active = true
}: {
  /** The sale: another key starts over. */
  key: string;
  fiat: SaleFiat;
  /** The point of the current hour, null while it is not known. */
  rate: HourRate | null;
  /**
   * Unix seconds (nowUnix, src/lib/clock.ts): the start of the sale. An invoice declared for it
   * must be dated from then on (datedForSale).
   */
  startsAt: number;
  /**
   * Unix seconds (nowUnix, src/lib/clock.ts): the end of the sale, whatever was paid: nothing is
   * asked past it.
   */
  endsAt: number;
  /** The sale's on-chain address when it is fixed (the payer's page), null without one. */
  address?: string | null;
  /**
   * The point of sale: takes an address with the first invoice, for its amount, or tells why there
   * is none (onchain-pool.ts). Once only: never again for the same sale, whose code would change.
   */
  takeAddress?: (sats: bigint) => Promise<OnchainTake>;
  /** Gives back an address taken for an invoice never shown. */
  releaseAddress?: (address: string) => void;
  lightningAddress: string;
  note: string;
  /**
   * Which invoices this hook asks for: all of them, only the rest of an underpayment, or none (a
   * sale followed only to settle it, through the invoices declared for it: its final version).
   */
  own: "all" | "rest" | "none";
  external?: readonly ExternalInvoice[];
  /**
   * The registry of Lightning payments (src/lib/registry/): every invoice is declared on it before
   * its code is shown, the invoices other devices declared for the sale are counted, and a payment
   * counts only when no other sale declared it. Null: none (a device without the business's
   * registry key, a payment link made before the registry).
   */
  registry?: Registry | null;
  /**
   * Where the business's devices record the transactions they see paying the sale's address
   * (useOnchainTimes: a replacement, RBF, keeps the time of the payment it replaces). Null: nothing
   * recorded nor read (a payer's page).
   */
  sightings?: SightingsBook | null;
  /**
   * No invoice is asked before a majority of the relays gave the sale's declarations: the payer's
   * page, opened maybe after the payer paid the point of sale's code, never shows another one then.
   */
  awaitDeclared?: boolean;
  /**
   * Tells the payments of the invoices instead of LUD-21 (useInvoicesWatch): the owner's wallet, for
   * a sale it settles long after its end (OwnerLinksFinalizer.tsx).
   */
  proof?: InvoiceProof | null;
  /**
   * The sale's tolerance of on-chain underpayments, basis points (src/lib/onchain/tolerance.ts):
   * paid on-chain short of the amount due by no more than it, the sale is paid (being confirmed
   * first); short by more, its whole rest is asked. The business's side only (the point of sale,
   * the settling of a link): 0 on a payer's page, which never knows it (it learns the outcome from
   * the link's final version).
   */
  tolerance?: number;
  /**
   * Where its on-chain address is watched (src/features/onchain/explorer.ts): `device`, the
   * merchant's own node when the account names one, on the business's devices; mempool.space
   * (`public`) on a payer's page, whose browser cannot reach the merchant's network.
   */
  explorer?: ExplorerChoice;
  active?: boolean;
}): {
  state: SaleState;
  /** What the payments reached, a disputed payment aside: never "disputed" (display only). */
  reached: SaleState;
  now: number;
  address: string | null;
  dueNow: bigint | null;
  /** The address was read, and nothing pays it. */
  onchainRead: boolean;
  /**
   * The first answers of its checks came: the invoices other devices declared (a majority of the
   * relays), each invoice made elsewhere checked once (LUD-21, or `proof`), the address read once.
   * A payment link's page shows neither a code nor "Request expired" before (useSharedInvoice).
   */
  answered: boolean;
  /**
   * How many invoices other devices declared for the sale (src/lib/registry/), once a majority of
   * the relays gave them; null until then, and without a registry.
   */
  declaredCount: number | null;
  /**
   * Once the sale is paid, expired or underpaid past its end: what its final version proves it
   * with; null until then.
   */
  settlement: Settlement | null;
  /**
   * The Lightning invoices counted as paying the sale, each with its preimage: their proof, which
   * the sale's paid record carries (useSaleRecord, MemberSale.lightning).
   */
  lightningProofs: { invoice: string; preimage: string }[];
} {
  const [asked, setAsked] = useState<Asked | null>(null);
  const current: Asked = asked?.key === key ? asked : askedAfresh(key);
  const segments = current.segments;
  const address = takeAddress ? (current.address ?? null) : fixedAddress;
  const [now, setNow] = useState(nowUnix);
  // The hour of the point that prices the present: the one that began 5 minutes ago.
  const hour = pointHourOf(now);

  // Amounts due by hour, for this fiat amount (another amount starts afresh): the current hour's
  // from its point, the hours since a payment read from CoinGecko.
  const fiatKey = `${fiat.currency}|${fiat.minor}|${fiat.digits}`;
  // With the points they come from (a final version names the one that fixed what was paid).
  const [duesHeld, setDuesHeld] = useState<{
    fiat: string;
    byHour: ReadonlyMap<number, bigint>;
    rates: ReadonlyMap<number, number>;
  }>(() => ({ fiat: fiatKey, byHour: new Map(), rates: new Map() }));
  const dues: ReadonlyMap<number, bigint> = duesHeld.fiat === fiatKey ? duesHeld.byHour : NO_DUES;
  const rates: ReadonlyMap<number, number> = duesHeld.fiat === fiatKey ? duesHeld.rates : NO_RATES;
  const dueOf = (time: number): bigint | null => dues.get(time) ?? null;
  // Taken during the render: kept for the hours that follow (the lowest amount due since a payment).
  if (rate && !dues.has(rate.hour)) {
    const due = fiatToSats(fiat.minor, fiat.digits, rate.rate);
    setDuesHeld({
      fiat: fiatKey,
      byHour: new Map([...dues, [rate.hour, due]]),
      rates: new Map([...rates, [rate.hour, rate.rate]])
    });
  }
  const dueNow = rate && rate.hour === hour ? dueOf(hour) : null;

  // On-chain: what pays the address, and when each counts from (when it was sent, or when the
  // payment a replacement stands for was: useOnchainTimes).
  const [onchainExpected, setOnchainExpected] = useState<bigint>(0n);
  // Watched as long as the screen is: after a payment over Lightning too, so that its address goes
  // back to the pool only once read unpaid, and an on-chain part keeps being confirmed.
  const onchain: OnchainPayment = useOnchainPayment({
    address,
    expected: onchainExpected,
    active,
    explorer
  });
  const onchainTxs = "transactions" in onchain ? onchain.transactions : [];
  const txids = onchainTxs.map((tx) => tx.txid);
  const onchainSats = "received" in onchain ? onchain.received : 0n;
  const receivedAt = useOnchainTimes({
    address,
    listed: onchainTxs,
    book: sightings,
    // Recorded once seen paying the address, by clocks maybe behind this one (the 5-minute
    // tolerance of src/lib/clock.ts).
    since: startsAt - SIGHTINGS_CLOCK_MARGIN_SECONDS,
    active
  });
  const missingTimes = txids.filter((txid) => !receivedAt.has(txid));
  const txHour =
    txids.length > 0 && missingTimes.length === 0
      ? pointHourOf(Math.floor(Math.max(...txids.map((txid) => receivedAt.get(txid) ?? 0)) / 1000))
      : null;

  // The invoices other devices declared for the sale (a payment link's page, the point of sale):
  // counted when paid, never shown here. Until a majority of the relays was read, the sale is never
  // said unpaid: one of them may have been paid.
  const registryId = registry ? registry.saleKeys.nostr.publicKey : null;
  const [declaredHeld, setDeclaredHeld] = useState<{
    id: string;
    invoices: readonly ExternalInvoice[];
  } | null>(null);
  const declaredRead = declaredHeld !== null && declaredHeld.id === `${key}|${registryId}`;
  const declarationsKnown = registry === null || declaredRead;
  // No majority answered yet: the payer's page, which waits for them before asking an invoice,
  // says the connection failed rather than waiting without an end (read again meanwhile).
  const [declaredFailed, setDeclaredFailed] = useState<string | null>(null);
  const declarationsFailed =
    awaitDeclared && !declarationsKnown && declaredFailed === `${key}|${registryId}`;
  // A payment is its payment hash, however its invoice is written.
  const ownRequests = new Set(
    segments.flatMap((segment) => segment.invoice?.decoded.paymentHash ?? [])
  );
  // Judged at each render: the sale's start moves with the clock's correction (src/lib/clock.ts).
  const declared = (declaredRead ? declaredHeld.invoices : []).filter(
    (entry) =>
      !ownRequests.has(entry.invoice.decoded.paymentHash) &&
      datedForSale(entry.invoice, startsAt, endsAt)
  );
  useEffect(() => {
    if (!registry || !active) return;
    const id = `${key}|${registry.saleKeys.nostr.publicKey}`;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let readOnce = false;
    const read = async () => {
      try {
        const network = invoiceNetwork();
        const [pay, invoices] = await Promise.all([
          payRequestOf(lightningAddress),
          fetchDeclaredInvoices(registry, network)
        ]);
        if (alive && invoices) {
          readOnce = true;
          // Made under a former name of the open account's address: still its own.
          const former = openAccountFormerMetadata();
          const valid = invoices.filter((invoice) =>
            checkDeclaredInvoice(invoice, pay, network, former)
          );
          setDeclaredHeld((last) => {
            const known = last?.id === id ? last.invoices : [];
            const added = valid
              .filter(
                (invoice) =>
                  !known.some(
                    (entry) => entry.invoice.decoded.paymentHash === invoice.decoded.paymentHash
                  )
              )
              .map((invoice): ExternalInvoice => ({
                id: `declared|${invoice.decoded.paymentHash}`,
                invoice,
                hour: pointHourOf(invoice.decoded.timestamp),
                expiresAt: invoice.decoded.timestamp + invoice.decoded.expirySeconds,
                since: nowUnix()
              }));
            return added.length === 0 && last?.id === id
              ? last
              : { id, invoices: [...known, ...added] };
          });
        }
      } catch (error) {
        logFailure("Reading the sale's declarations failed", error);
      }
      if (!alive) return;
      if (!readOnce) setDeclaredFailed(id);
      timer = setTimeout(() => void read(), DECLARATIONS_INTERVAL_MS);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // Keyed by the sale and its registry; the others follow them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registryId, active, lightningAddress]);

  // Lightning: every invoice of the sale, this hook's and the others', until paid or expired.
  const watched: WatchedInvoice[] = [
    ...segments.flatMap((segment) =>
      segment.invoice
        ? [
            {
              id: segment.id,
              invoice: segment.invoice,
              expiresAt: segment.expiresAt,
              since: segment.since
            }
          ]
        : []
    ),
    ...[...external, ...declared].map(({ id, invoice, expiresAt, since }) => ({
      id,
      invoice,
      expiresAt,
      since,
      immediate: true
    }))
  ];
  const outcomes = useInvoicesWatch(watched, active, proof);
  const paidEntries = [
    ...segments.flatMap((s) => (s.invoice ? [{ id: s.id, hour: s.hour, invoice: s.invoice }] : [])),
    ...[...external, ...declared].map((e) => ({ id: e.id, hour: e.hour, invoice: e.invoice }))
  ].flatMap((entry, index, all) => {
    const outcome = outcomes.get(entry.id);
    // One payment counts once, whichever entries carry its invoice.
    const hash = entry.invoice.decoded.paymentHash;
    const first = all.findIndex(
      (other) => other.invoice.decoded.paymentHash === hash && outcomes.get(other.id)?.paidAt
    );
    return outcome?.paidAt && first === index
      ? [
          {
            hour: entry.hour,
            sats: invoiceSats(entry.invoice),
            at: outcome.paidAt,
            invoice: entry.invoice,
            preimage: outcome.preimage ?? null
          }
        ]
      : [];
  });

  // A paid invoice counts once no other sale declared its payment (src/lib/registry/).
  const [uniqueness, setUniqueness] = useState<ReadonlyMap<string, Uniqueness>>(() => new Map());
  const hashOf = (paid: (typeof paidEntries)[number]) => paid.invoice.decoded.paymentHash;
  const unsettled = registry
    ? paidEntries
        .map(hashOf)
        .filter((hash) => uniqueness.get(hash) !== "unique" && uniqueness.get(hash) !== "conflict")
    : [];
  const unsettledKey = [...new Set(unsettled)].sort().join(",");
  useEffect(() => {
    if (!registry || unsettledKey === "") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      let again = false;
      for (const hash of unsettledKey.split(",")) {
        const answer = await paymentUniqueness(registry, hash);
        if (!alive) return;
        if (answer === "unknown") again = true;
        else setUniqueness((last) => new Map(last).set(hash, answer));
      }
      if (again && alive) timer = setTimeout(() => void read(), UNIQUENESS_RETRY_MS);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // Keyed by the payments to settle; the registry follows the sale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsettledKey]);
  const lightningPaid = registry
    ? paidEntries.filter((paid) => uniqueness.get(hashOf(paid)) === "unique")
    : paidEntries;
  // A payment of the sale that another sale declared too: the sale asks nothing more (SaleState
  // "disputed").
  const disputed =
    registry !== null && paidEntries.some((paid) => uniqueness.get(hashOf(paid)) === "conflict");
  // Paid, but whether it belongs to this sale only is not known yet.
  const uniquenessPending = unsettled.length > 0;
  // Since when, in Unix seconds: the first of those payments.
  const unsettledSince = paidEntries
    .filter((paid) => unsettled.includes(hashOf(paid)))
    .reduce<number | null>((first, paid) => {
      const at = Math.floor(paid.at.getTime() / 1000);
      return first === null || at < first ? at : first;
    }, null);
  const settling = unsettledSince !== null && now - unsettledSince >= UNIQUENESS_SLOW_SECONDS;
  const lightningSats = lightningPaid.reduce((sum, paid) => sum + paid.sats, 0n);
  const lastPaid = lightningPaid.reduce<(typeof lightningPaid)[number] | null>(
    (last, paid) => (last === null || paid.at > last.at ? paid : last),
    null
  );
  const lastLightning = lastPaid?.at ?? null;

  // Coverage: the sats received against the lowest amount due at the hour of the last payment or
  // any hour since (what was received stays counted in sats).
  const received = lightningSats + onchainSats;
  // A transaction whose hour is not told yet.
  const txHourUnknown = onchainSats > 0n && txHour === null;
  const paymentHours = [
    ...lightningPaid.map((paid) => paid.hour),
    ...(onchainSats > 0n && txHour !== null ? [txHour] : [])
  ];
  const lastPaymentHour = paymentHours.length > 0 ? Math.max(...paymentHours) : null;
  let bestDue: bigint | null = null;
  // The hour whose point fixed `bestDue` (the first of the lowest).
  let bestHour: number | null = null;
  // An hour of the span whose point is not known: every past hour's is published, the current
  // hour's comes from `rate` (or is not published yet).
  let pastUnknown = false;
  // The hours that may cover the sale: from the last payment's to the present, but never past the
  // sale's end (its last second's hour): an underpaid sale stays so whatever the rate does after
  // it, and a transaction received after it counts at its own hour only.
  const lastHour =
    lastPaymentHour === null
      ? null
      : // A payment dated after this device's present (an invoice the other side of the sale
        // asked, or a transaction, dated by a clock ahead of this one around HH:05): the amount
        // due at its hour stays unknown here until this clock gets there, never "nothing covered".
        Math.max(lastPaymentHour, Math.min(hour, pointHourOf(endsAt - 1)));
  if (lastPaymentHour !== null && lastHour !== null) {
    for (let time = lastPaymentHour; time <= lastHour; time += HOUR_SECONDS) {
      const due = dues.get(time);
      if (due !== undefined && (bestDue === null || due < bestDue)) {
        bestDue = due;
        bestHour = time;
      } else if (due === undefined && (time < hour || time === lastPaymentHour)) {
        pastUnknown = true;
      }
    }
  }
  const coveredByLightning = bestDue !== null && lightningSats >= bestDue;
  // Whether the sale is covered cannot be told yet: a payment's hour, or an hour since, unknown.
  const duePending =
    received > 0n &&
    (txHourUnknown ||
      (pastUnknown &&
        !(bestDue !== null && coversWith(received, onchainSats, bestDue, tolerance))));

  // The points of the past hours of that span, read in as few requests as they need.
  const lastPast = lastHour === null ? null : Math.min(lastHour, hour - HOUR_SECONDS);
  const firstUnknown =
    lastPaymentHour === null || lastPast === null
      ? null
      : (() => {
          for (let time = lastPaymentHour; time <= lastPast; time += HOUR_SECONDS) {
            if (!dues.has(time)) return time;
          }
          return null;
        })();
  const neededKey = firstUnknown === null ? null : `${firstUnknown}-${lastPast}`;
  useEffect(() => {
    if (neededKey === null || firstUnknown === null || lastPast === null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const points = await fetchHourPoints(fiat.currency, firstUnknown, lastPast, nowUnix());
        if (!alive) return;
        const fetched = [...points].map(([time, point]): [number, bigint] => [
          time,
          fiatToSats(fiat.minor, fiat.digits, point)
        ]);
        setDuesHeld((last) => ({
          fiat: fiatKey,
          byHour: new Map([...(last.fiat === fiatKey ? last.byHour : []), ...fetched]),
          rates: new Map([...(last.fiat === fiatKey ? last.rates : []), ...points])
        }));
        // A past hour CoinGecko did not give: asked again.
        if (points.size < (lastPast - firstUnknown) / HOUR_SECONDS + 1) {
          timer = setTimeout(() => void read(), RETRY_SECONDS * 1000);
        }
      } catch (error) {
        logFailure("Reading the points of past hours failed", error);
        if (alive) timer = setTimeout(() => void read(), RETRY_SECONDS * 1000);
      }
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // Keyed by the span to read; the amount is part of `fiatKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, fiatKey]);

  // What the address must still bring: the on-chain watch judges its own part with it. Nothing once
  // Lightning paid it all; else the least the tolerance accepts, less what Lightning paid, a sat
  // at least (something must come on-chain for the tolerance to apply).
  const expectedNow = bestDue ?? dueNow;
  const nextExpected =
    expectedNow === null ? null : dueOnchain(expectedNow, tolerance, lightningSats);
  // Taken during the render: the watch judges with it from the render that follows at once.
  if (nextExpected !== null && nextExpected !== onchainExpected) setOnchainExpected(nextExpected);
  // Until the watch judges with the amount due now, its verdict is not used.
  const onchainJudged = nextExpected === null || nextExpected === onchainExpected;
  const onchainPending = duePending || (onchainSats > 0n && !onchainJudged);

  const ended = now >= endsAt;
  const covered =
    coveredByLightning ||
    (!onchainPending &&
      onchainSats > 0n &&
      (onchain.phase === "unconfirmed" || onchain.phase === "paid"));

  // The invoice to ask now: the whole amount before any payment, else the rest, at the hour's point.
  const target = ((): bigint | null => {
    if (!active || current.failure || dueNow === null || covered || onchainPending) return null;
    if (uniquenessPending || disputed || (awaitDeclared && !declarationsKnown)) return null;
    // Nothing is asked past the sale's end, an underpayment's rest included.
    if (own === "none" || ended) return null;
    if (received === 0n) return own === "all" ? dueNow : null;
    return dueNow > received ? dueNow - received : null;
  })();
  // One invoice per hour and amount, asked again after a failure (at its `expiresAt`). One the
  // service made end sooner than asked ends the sale before any payment (below); of a rest, it is
  // asked again once ended past its grace period, so that a payment in its last seconds counts.
  const live =
    target === null
      ? null
      : (segments.find(
          (segment) =>
            segment.hour === hour &&
            segment.sats === target &&
            (segment.invoice === null
              ? now < segment.expiresAt
              : segment.kind === "whole" || !outcomes.get(segment.id)?.expired)
        ) ?? null);
  const request = target !== null && !live ? `${key}|${hour}|${target}|${segments.length}` : null;

  useEffect(() => {
    if (request === null || target === null) return;
    // The end the invoice must have, exactly: the sale's, or its point's period's (HH:05:00).
    const targetEnd = Math.min(endsAt, pointEnd(hour));
    if (targetEnd - nowUnix() < MIN_INVOICE_SECONDS) return;
    // Invoices of this hour and amount that came dated otherwise than asked.
    const misfits = segments.filter(
      (segment) => segment.misfit && segment.hour === hour && segment.sats === target
    ).length;
    let alive = true;
    // Nothing shown yet (only invoices dated otherwise than asked, never shown): a failure is the
    // sale's, said with "Try again", not retried silently.
    const first = received === 0n && segments.every((segment) => segment.misfit);
    const kind = received === 0n ? "whole" : "rest";
    const store = (segment: Omit<Segment, "id" | "kind">, taken?: OnchainTake) => {
      if (!alive) return;
      setAsked((last) => {
        const base: Asked = last?.key === key ? last : askedAfresh(key);
        return {
          ...base,
          ...(taken !== undefined
            ? { address: taken.address, onchainUnavailable: taken.unavailable }
            : {}),
          segments: [
            ...base.segments,
            { ...segment, kind, id: `${key}|${segment.hour}|${base.segments.length}` }
          ]
        };
      });
    };
    const fail = (failure: Extract<SaleState, { phase: "failed" }>) => {
      if (alive) {
        setAsked((last) => ({ ...(last?.key === key ? last : askedAfresh(key)), failure }));
      }
    };
    void (async () => {
      const payRequest = payRequestOf(lightningAddress);
      try {
        const pay = await payRequest;
        const limits = sendableSats(pay);
        if (target < limits.min || target > limits.max) {
          // Read again for the next hour: the service may have changed its bounds.
          forgetPayRequest(lightningAddress, payRequest);
          if (target > limits.max && kind === "whole" && acceptsOnchain(target)) {
            // Above what Lightning takes: the sale's address alone, taken now when it has none
            // yet, as with a first invoice.
            let taken: OnchainTake | undefined;
            if (takeAddress && current.address === undefined) {
              taken = await takeAddress(target);
              if (!alive) {
                if (taken.address !== null) releaseAddress?.(taken.address);
                return;
              }
            }
            const saleAddress = taken
              ? taken.address
              : takeAddress
                ? current.address
                : fixedAddress;
            if (saleAddress) {
              const since = nowUnix();
              setNow(since);
              return store(
                {
                  hour,
                  sats: target,
                  invoice: null,
                  onchainOnly: true,
                  since,
                  expiresAt: targetEnd
                },
                taken
              );
            }
            if (first) {
              // The pool's reason when it was asked; otherwise the sale offers no address.
              const onchain = taken?.unavailable ?? "none";
              return fail({ phase: "failed", failure: "limits", limits, onchain });
            }
          } else if (first) {
            return fail({ phase: "failed", failure: "limits", limits });
          }
          // Out of the service's bounds: nothing asked over Lightning this hour (the rest of an
          // underpayment stays payable on-chain, from MIN_ONCHAIN_SATS).
          const since = nowUnix();
          return store({
            hour,
            sats: target,
            invoice: null,
            since,
            expiresAt: pointEnd(hour)
          });
        }
        // Asked when its issuer will most likely date it in the middle of one of its seconds, for
        // the time from that date to its end (src/lib/clock.ts).
        await new Promise((resolve) => setTimeout(resolve, invoiceRequestDelayMs()));
        if (!alive) return;
        const sentAt = Date.now();
        const expiry = targetEnd - expectedInvoiceDate(sentAt);
        if (expiry < MIN_INVOICE_SECONDS) return;
        let invoice: Invoice;
        try {
          invoice = await requestInvoice(pay, {
            amountSats: target,
            comment: note,
            expirySeconds: expiry,
            network: invoiceNetwork()
          });
        } catch (error) {
          // A callback that moved answers like a network failure: never kept.
          forgetPayRequest(lightningAddress, payRequest);
          throw error;
        }
        // Its issuer's date tells how far off this device's clock is (src/lib/clock.ts).
        observeInvoiceDate(invoice.decoded.timestamp, sentAt, Date.now());
        // Judged on its own date, as the other side of the sale judges it (checkDeclaredInvoice):
        // of the period whose point priced it, and ending exactly at its end. Otherwise (its
        // date not the one predicted, a clock that was
        // off) it is neither declared nor shown: asked again, the clock now corrected. A service
        // that made it shorter than asked: kept, the sale ends with it (below).
        const { decoded } = invoice;
        const ends = bolt11ExpiresAt(decoded);
        if (
          pointHourOf(decoded.timestamp) !== hour ||
          !fitsItsPeriod(decoded) ||
          (decoded.expirySeconds === expiry ? ends !== targetEnd : ends > targetEnd)
        ) {
          const since = nowUnix();
          if (alive) setNow(since);
          return store({
            hour,
            sats: target,
            invoice: null,
            misfit: true,
            since,
            expiresAt: since + (misfits + 1 < IMMEDIATE_MISFITS ? 0 : MISFIT_RETRY_SECONDS)
          });
        }
        // Declared before its code is shown (src/lib/registry/): a payment of it then counts for
        // this sale only. Relays out of reach make no code, like the LNURL server out of reach.
        if (registry) {
          try {
            await declareInvoice(registry, invoice, { fiat, note });
          } catch (error) {
            throw new LnurlError("network", `Declaring the invoice failed: ${String(error)}`);
          }
          if (!alive) return;
        }
        // The address, with the first invoice only: a failed request uses none, and below the
        // on-chain floor the sale is Lightning only.
        let taken: OnchainTake | undefined;
        if (takeAddress && current.address === undefined) {
          taken = acceptsOnchain(target) ? await takeAddress(target) : NO_ADDRESS;
          if (!alive) {
            if (taken.address !== null) releaseAddress?.(taken.address);
            return;
          }
        }
        // Its end as its issuer counts it: the clock nowUnix reads (src/lib/clock.ts).
        const since = nowUnix();
        setNow(since);
        store(
          { hour, sats: target, invoice, since, expiresAt: bolt11ExpiresAt(invoice.decoded) },
          taken
        );
      } catch (error) {
        logFailure("Asking the invoice failed", error);
        if (first) return fail({ phase: "failed", failure: failureOf(error) });
        const since = nowUnix();
        store({ hour, sats: target, invoice: null, since, expiresAt: since + RETRY_SECONDS });
      }
    })();
    return () => {
      alive = false;
    };
    // Keyed by `request` (the sale, the hour, the amount, the count); the others follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // The sale's invoices, this hook's and the others': past the sale's end, one neither paid nor
  // expired may still be reported paid (invoice.ts, EXPIRY_GRACE_SECONDS).
  const allInvoices = [
    ...segments.flatMap((segment) =>
      segment.invoice ? [{ id: segment.id, expiresAt: segment.expiresAt }] : []
    ),
    ...[...external, ...declared].map((entry) => ({ id: entry.id, expiresAt: entry.expiresAt }))
  ];
  const openInvoices = allInvoices.filter((entry) => {
    const outcome = outcomes.get(entry.id);
    return !outcome || (outcome.paidAt === null && !outcome.expired);
  });
  const invoicesOpen = openInvoices.length > 0;
  // Until when a payment of one of them may still be reported: the screen counts it down.
  const lateUntil = invoicesOpen
    ? Math.max(...openInvoices.map((entry) => entry.expiresAt)) + EXPIRY_GRACE_SECONDS
    : null;
  // What paid the address, each with when it was sent (null until it is read).
  const transactions: SaleTransaction[] | null = onchainTxs.every((tx) => receivedAt.has(tx.txid))
    ? onchainTxs.map(({ txid, sats, confirmations }) => ({
        txid,
        sats,
        confirmations,
        receivedAt: receivedAt.get(txid) ?? 0
      }))
    : null;

  // What pays the address, as `received` counts them (one spending from it pays none).
  const paying = onchainTxs.filter((tx) => tx.sats > 0n);
  // As the payer's page lists them.
  const confirming = paying.map((tx): ConfirmingTransaction => ({
    txid: tx.txid,
    confirmations: tx.confirmations,
    receivedAt: receivedAt.get(tx.txid) ?? null
  }));

  // What the sale's payments reached, as its settlement tells it.
  const reached = ((): SaleState => {
    if (current.failure && received === 0n) return current.failure;
    if (declarationsFailed && received === 0n) return { phase: "failed", failure: "network" };
    // A payment seen, whose sale is not settled yet: never "Expired" nor a new invoice meanwhile.
    if (uniquenessPending) {
      return { phase: "checking", bitcoin: false, paymentSeen: true, lateUntil: null, settling };
    }
    if (coveredByLightning && lastLightning) {
      return {
        phase: "paid",
        method: onchainSats > 0n ? "mixed" : "lightning",
        paidAt: lastLightning,
        received,
        invoice: lastPaid?.invoice ?? null,
        transactions: confirming,
        onchainConfirmed: onchain.phase === "paid"
      };
    }

    // Less than due was received: its rest is payable until the sale's end, then the sale stays
    // underpaid.
    const underpaid = (): SaleState => {
      if (!ended) {
        const topUp =
          segments.find(
            (segment) =>
              segment.hour === hour &&
              segment.sats === target &&
              now < segment.expiresAt &&
              segment.invoice !== null
          )?.invoice ?? null;
        return {
          phase: "underpaid",
          address,
          received,
          rest: dueNow === null ? null : dueNow > received ? dueNow - received : 0n,
          topUp,
          txids,
          receipts: [
            ...paying.map((tx): SaleReceipt => ({
              kind: "onchain",
              txid: tx.txid,
              sats: tx.sats,
              receivedAt: receivedAt.get(tx.txid) ?? null
            })),
            ...lightningPaid.map((paid): SaleReceipt => ({
              kind: "lightning",
              paymentHash: paid.invoice.decoded.paymentHash,
              sats: paid.sats
            }))
          ]
        };
      }
      // Past the end: an invoice of the rest paid before its end may be reported a little later,
      // another device's too, once its declaration is read.
      if (!declarationsKnown || invoicesOpen) {
        return { phase: "checking", bitcoin: false, paymentSeen: true, lateUntil, settling: false };
      }
      if (bestDue === null || transactions === null) {
        return {
          phase: "checking",
          bitcoin: true,
          paymentSeen: true,
          lateUntil: null,
          settling: false
        };
      }
      return {
        phase: "underpaidEnded",
        received,
        due: bestDue,
        lightning: lightningSats,
        transactions
      };
    };

    if (onchainSats > 0n) {
      if (onchainPending) {
        return {
          phase: "checking",
          bitcoin: true,
          paymentSeen: true,
          lateUntil: null,
          settling: false
        };
      }
      switch (onchain.phase) {
        case "paid":
          return {
            phase: "paid",
            method: lightningSats > 0n ? "mixed" : "onchain",
            paidAt: lastLightning ?? onchain.detectedAt,
            received,
            invoice: lastPaid?.invoice ?? null,
            transactions: confirming,
            onchainConfirmed: true
          };
        case "unconfirmed":
          return {
            phase: "unconfirmed",
            method: lightningSats > 0n ? "mixed" : "onchain",
            received,
            confirmations: onchain.confirmations,
            detectedAt: onchain.detectedAt,
            transactions: confirming
          };
        case "underpaid":
          return underpaid();
      }
    }
    // Paid over Lightning, at an hour whose amount due is not known yet.
    if (duePending)
      return {
        phase: "checking",
        bitcoin: false,
        paymentSeen: true,
        lateUntil: null,
        settling: false
      };
    // Paid over Lightning, the address not read yet: its part may be there (a sale followed afresh,
    // a link opened later, the explorer slow to answer), never "Expired" meanwhile.
    if (lightningSats > 0n && address !== null && onchain.phase === "unknown") {
      return {
        phase: "checking",
        bitcoin: true,
        paymentSeen: true,
        lateUntil: null,
        settling: false
      };
    }
    // The rest was paid over Lightning, then the on-chain part vanished (spent elsewhere): what the
    // Lightning payments brought is all there is, the sale is underpaid.
    if (lightningSats > 0n) return underpaid();

    // Nothing paid (or no longer: a transaction replaced): the invoice of the whole amount of the
    // hour while the sale lasts, never one of a rest; above the service's maximum, its address
    // alone.
    const all = [
      ...segments.flatMap((segment) =>
        segment.kind === "whole" && (segment.invoice || (segment.onchainOnly && address !== null))
          ? [
              {
                id: segment.id,
                hour: segment.hour,
                sats: segment.sats,
                invoice: segment.invoice,
                expiresAt: segment.expiresAt
              }
            ]
          : []
      ),
      ...external.map((entry) => ({
        id: entry.id,
        hour: entry.hour,
        sats: invoiceSats(entry.invoice),
        invoice: entry.invoice,
        expiresAt: entry.expiresAt
      }))
    ];
    // The invoice of this hour.
    const open = all.filter((entry) => entry.hour === hour && now < entry.expiresAt);
    const shown = open.length > 0 ? open[open.length - 1] : undefined;
    // The service ended this hour's invoice sooner than asked: the sale ends with it.
    const endedEarly = segments.some(
      (segment) =>
        segment.kind === "whole" &&
        segment.hour === hour &&
        segment.invoice !== null &&
        now >= segment.expiresAt
    );
    if (!ended && !endedEarly) {
      if (shown) {
        return {
          phase: "open",
          invoice: shown.invoice,
          hour: shown.hour,
          sats: shown.sats,
          invoiceExpiresAt: shown.expiresAt,
          endsAt,
          address,
          onchainUnavailable: takeAddress ? current.onchainUnavailable : null
        };
      }
      return { phase: "creating", waitingForRate: dueNow === null };
    }
    // Past the end: no code any more, but an invoice paid before its end may be reported a little
    // later (invoice.ts, EXPIRY_GRACE_SECONDS), another device's too, once its declaration is read;
    // then the address must have been read unpaid before saying that nothing was received.
    if (!declarationsKnown || invoicesOpen) {
      return { phase: "checking", bitcoin: false, paymentSeen: false, lateUntil, settling: false };
    }
    return onchain.phase === "unknown"
      ? { phase: "checking", bitcoin: true, paymentSeen: false, lateUntil: null, settling: false }
      : { phase: "expired" };
  })();
  // What the screens show: a disputed payment instead of what would ask for money again or tell
  // that nothing came (SaleState "disputed").
  const state: SaleState =
    disputed && DISPUTED_HIDES.has(reached.phase) ? { phase: "disputed" } : reached;

  // What the final version of the sale's link proves its outcome with, once every part of it is
  // known: the preimage of each invoice counted, when each transaction was sent, the point
  // of the amount covered (or fallen short of).
  const settlement = ((): Settlement | null => {
    if (
      reached.phase !== "paid" &&
      reached.phase !== "expired" &&
      reached.phase !== "underpaidEnded"
    ) {
      return null;
    }
    // Every payment of the sale must be known: its address read too, even when Lightning paid it.
    if (address !== null && onchain.phase === "unknown") return null;
    const lightning: Settlement["lightning"] = [];
    for (const paid of lightningPaid) {
      if (paid.preimage === null) return null;
      lightning.push({ invoice: paid.invoice, preimage: paid.preimage });
    }
    let onchainPart: Settlement["onchain"] = null;
    if (onchainSats > 0n) {
      if (address === null || transactions === null) return null;
      onchainPart = {
        address,
        transactions: transactions.map(({ txid, receivedAt: time, sats }) => ({
          txid,
          receivedAt: time,
          sats
        })),
        sats: onchainSats
      };
    }
    const common = { received, accepted: false, lightning, onchain: onchainPart };
    const point = bestHour === null ? undefined : rates.get(bestHour);
    if (reached.phase === "paid") {
      if (bestDue === null || bestHour === null || point === undefined) return null;
      return {
        status: "paid",
        ...common,
        // Paid with less than due: only the tolerance lets an on-chain payment do so.
        accepted: received < bestDue,
        due: bestDue,
        point: { hour: bestHour, rate: point },
        finalFrom: now
      };
    }
    // Otherwise final once every invoice of the sale, and the sale itself, ended 3 hours ago.
    const finalFrom =
      Math.max(endsAt, ...allInvoices.map((entry) => entry.expiresAt)) + FINAL_DELAY_SECONDS;
    if (reached.phase === "expired") {
      return { status: "expired", ...common, due: null, point: null, finalFrom };
    }
    // Underpaid: once every transaction is deep enough, as a payment is (a replaced one would leave
    // its final version wrong).
    if (bestDue === null || bestHour === null || point === undefined) return null;
    if (onchainTxs.some((tx) => tx.confirmations < REQUIRED_CONFIRMATIONS)) return null;
    return {
      status: "underpaid",
      ...common,
      due: bestDue,
      point: { hour: bestHour, rate: point },
      finalFrom
    };
  })();

  // The clock, until the sale is paid, expired or underpaid past its end: an on-chain payment being
  // confirmed may still be replaced (RBF), and the sale then goes on at the hour it is by then.
  // Past its end, nothing depends on the time any more: a transaction paying it later counts at the
  // hour it was sent (the sale is `checking` meanwhile, and the clock goes on).
  const ticking =
    reached.phase !== "paid" &&
    reached.phase !== "expired" &&
    reached.phase !== "underpaidEnded" &&
    reached.phase !== "failed";
  useEffect(() => {
    if (!ticking) return;
    const clock = setInterval(() => setNow(nowUnix()), 1000);
    return () => clearInterval(clock);
  }, [ticking]);

  return {
    state,
    reached,
    now,
    address,
    dueNow,
    onchainRead: onchain.phase === "waiting",
    answered:
      declarationsKnown &&
      [...external, ...declared].every((entry) => outcomes.has(entry.id)) &&
      (address === null || onchain.phase !== "unknown"),
    declaredCount: registry !== null && declaredRead ? declared.length : null,
    settlement,
    lightningProofs: lightningPaid.flatMap((paid) =>
      paid.preimage === null ? [] : [{ invoice: paid.invoice.pr, preimage: paid.preimage }]
    )
  };
}
