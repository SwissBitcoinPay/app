import { useEffect, useMemo, useState } from "react";

import { REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import { REGISTRY_TIMEOUT_MS } from "@/config/registry";
import {
  finalPaidDetails,
  watchedTransactions,
  type PaymentDetails
} from "@/features/payment-link/details";
import { watchWhileActive } from "@/features/relays/live-watch";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { useRate } from "@/features/terminal/useRate";
import { useSaleAcceptance } from "@/features/terminal/useSaleAcceptance";
import {
  useSale,
  type ChargeFailure,
  type SaleReceipt,
  type SaleTransaction
} from "@/features/terminal/useSale";
import { LNURL_TIMEOUT_MS, type Invoice } from "@/lib/lightning/lnurl";
import { CHAIN_TIMEOUT_MS } from "@/lib/onchain/esplora";
import {
  fetchPaymentLink,
  parsePaymentLinkFragment,
  watchLinkFinal
} from "@/lib/payment-link/link";
import {
  LONG_SALE_LINK_VERSION,
  type SharedInvoice,
  type SharedLink,
  type SharedView
} from "@/lib/payment-link/payload";
import { saleRegistry, type Registry } from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";

/**
 * A link not found at once is looked up once more after this: the merchant's share sheet opens
 * while the link is being published (usePaymentLink), a payer opening it at once may be early.
 */
export const NOT_FOUND_RETRY_MS = 3000;

/**
 * How long a checkout link's page (useCheckoutLink) waits for the first answers of its checks (the
 * LNURL server's, the explorer's, asked at once) before it shows a code to pay, or "Request
 * expired": as long as their requests may take (otherwise "Request expired" shows
 * for a moment before "Confirming"). Past that, a service failing, it shows what it knows,
 * still checked.
 */
export const FIRST_CHECK_TIMEOUT_MS = Math.max(LNURL_TIMEOUT_MS, CHAIN_TIMEOUT_MS);

/**
 * The same for a payment link's page: the invoices other devices declared are checked only once a
 * majority of the relays gave them (useSale reads them with the merchant's pay request), so their
 * LUD-21 answers may come that much later; the explorer is read meanwhile.
 */
export const LINK_FIRST_CHECK_TIMEOUT_MS = Math.max(
  Math.max(REGISTRY_TIMEOUT_MS, LNURL_TIMEOUT_MS) + LNURL_TIMEOUT_MS,
  CHAIN_TIMEOUT_MS
);

/**
 * Whether `ms` passed since `key` (non-null) was first followed: another key (a record read again,
 * another attempt) is waited for again.
 */
export function useWaited<K>(key: K | null, ms: number): boolean {
  const [waited, setWaited] = useState<K | null>(null);
  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => setWaited(() => key), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);
  return key !== null && waited === key;
}

/**
 * A payment seen while the sale lasts, not counted yet (useSale's "checking" with `paymentSeen`:
 * its read on the registry, when a transaction was sent): the screen shown last stays, its
 * code blurred and nothing on it offering to pay; `bitcoin` when the explorers are what is waited
 * for.
 */
export type PaymentCheck = { bitcoin: boolean };

export type SharedInvoiceState =
  | { phase: "loading" }
  /** The invoice of the hour is being asked from the merchant's Lightning address. */
  | { phase: "creating" }
  /** A new hour: its point is not published yet (src/lib/rates/), no amount can be fixed. */
  | { phase: "updating" }
  /**
   * Whether the sale was paid is not known yet (useSale's "checking"): a payment seen, and no code
   * to keep (past the sale's end, or nothing shown yet); `bitcoin` when the explorers are what is
   * waited for.
   */
  | { phase: "checking"; bitcoin: boolean }
  /**
   * The sale ended with nothing received, and whether it was paid is not known yet (useSale's
   * "checking" without `paymentSeen`): its invoices are still checked for a payment reported late,
   * until `lateUntil` (Unix seconds, nowUnix; null once none is checked any more), as at the point
   * of sale; `bitcoin` when the explorers are what is waited for.
   */
  | { phase: "ended"; view: SharedView; bitcoin: boolean; lateUntil: number | null }
  /** The URL's fragment has no valid id and key: a link cut short when it was copied. */
  | { phase: "invalid" }
  /** Relays answered without it: a wrong link, or one whose sale ended (relays drop it). */
  | { phase: "notFound" }
  /** No relay answered, or the invoice could not be asked: the payer's connection, most likely. */
  | { phase: "unreachable" }
  /**
   * The merchant's Lightning address refused the amount, or answered what the app refuses.
   * `onchainOnly`: above the most it accepts, the sale is payable on-chain only, and its link has
   * no address (as at the point of sale, useSale.ts).
   */
  | {
      phase: "failed";
      failure: Exclude<ChargeFailure, "network">;
      onchainOnly: boolean;
      businessName: string;
    }
  | { phase: "open"; invoice: SharedInvoice; checking?: PaymentCheck }
  /** Paid on-chain, enough: the network confirms the transaction. */
  | { phase: "unconfirmed"; view: SharedView; details: PaymentDetails }
  /**
   * Paid on-chain, not enough: `rest` of `due` is still to pay until the sale's end (`view.endsAt`),
   * over Lightning (`restInvoice`, null while it is asked or when none can be made) and, from
   * `MIN_ONCHAIN_SATS`, on-chain to `address` (null: Lightning only).
   */
  | {
      phase: "underpaid";
      view: SharedView;
      address: string | null;
      due: bigint;
      received: bigint;
      rest: bigint;
      restInvoice: Invoice | null;
      /** Each payment received (useSale's), whose sats add up to `received`. */
      receipts: SaleReceipt[];
      checking?: PaymentCheck;
    }
  /**
   * The sale ended with less than `due` received (useSale's "underpaidEnded", or a final version):
   * `lightning` of it over Lightning, `transactions` what paid the address.
   */
  | {
      phase: "underpaidEnded";
      view: SharedView;
      due: bigint;
      received: bigint;
      lightning: bigint;
      transactions: SaleTransaction[];
    }
  /** `paidAt`: when this page saw it paid; null for a final version (its proofs carry no time). */
  | { phase: "paid"; view: SharedView; paidAt: Date | null; details: PaymentDetails }
  /**
   * Paid short, and the business accepted what it received as paying it (its owner's acceptance,
   * src/lib/registry/sale-acceptance.ts): paid, at `received`.
   */
  | { phase: "accepted"; view: SharedView; received: bigint }
  /** Nothing was received in time. */
  | { phase: "expired"; view: SharedView }
  /**
   * A payment came, which another sale of the business declared too (useSale's "disputed"): the
   * business checks it; never a code to pay again, nor "Expired".
   */
  | { phase: "disputed"; view: SharedView }
  /** The business canceled the sale while nothing was received (a final version, final.ts). */
  | { phase: "canceled"; view: SharedView };

type Lookup =
  { phase: "loading" | "notFound" | "unreachable" } | { phase: "found"; link: SharedLink };

/** A screen with a code: kept, blurred, while a payment seen is checked. */
type CodeScreen = Extract<SharedInvoiceState, { phase: "open" | "underpaid" }>;

/**
 * `state` as a screen with a code to keep, with what tells it from another (a new invoice, a new
 * rest); null without one, or while it is already kept for a payment's check.
 */
function codeScreenOf(state: SharedInvoiceState): { signature: string; state: CodeScreen } | null {
  if (state.phase === "open" && !state.checking) {
    const { invoice } = state;
    const code = invoice.invoice?.pr ?? invoice.onchainAddress;
    return { signature: `open|${code}|${invoice.sats}|${invoice.expiresAt}`, state };
  }
  if (state.phase === "underpaid" && !state.checking) {
    const signature = [
      "underpaid",
      state.address,
      state.due,
      state.received,
      state.rest,
      state.restInvoice?.pr
    ].join("|");
    return { signature, state };
  }
  return null;
}

/**
 * The payer's side of a payment link: reads it from the relays with the id and key of the URL
 * fragment (`fragment`, read once: the page is keyed by it, src/app/pay.tsx), then follows the sale
 * as the point of sale does (src/features/terminal/useSale.ts).
 *
 * A link of version 3 holds the sale, not an invoice: the page asks its own invoices from the
 * merchant's Lightning address, hour by hour at the CoinGecko point of the hour (src/lib/rates/),
 * which it reads itself, and declares each one in the business's registry (src/lib/registry/)
 * before showing it, with the sale's keys (the link's key). It needs no point of sale online: a
 * payment of an invoice the page made, or the point of sale, counts for the sale on both sides,
 * as long as no other sale declared it. It also watches the on-chain address, and after an
 * underpayment asks for the rest until the sale's end, as the point of sale does.
 */
export function useSharedInvoice(fragment: string): {
  state: SharedInvoiceState;
  now: number;
  retry: () => void;
} {
  const [link] = useState(() => parsePaymentLinkFragment(fragment));
  const [lookup, setLookup] = useState<Lookup>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const found = link && lookup.phase === "found" ? lookup.link : null;
  const sale = found?.kind === "sale" ? found.sale : null;
  // A final version (src/lib/payment-link/final.ts): its outcome is shown as it is, nothing is
  // followed any more.
  const final = sale?.final ?? null;

  // Lookup.
  useEffect(() => {
    if (!link) return;
    let alive = true;
    void (async () => {
      const network = invoiceNetwork();
      // A final version a slower relay holds replaces the copy shown (link.ts, betterCopy), even
      // when it comes before the first copy is taken here.
      let better: SharedLink | null = null;
      const onBetter = (copy: SharedLink) => {
        better = copy;
        if (alive) setLookup({ phase: "found", link: copy });
      };
      let result = await fetchPaymentLink(link, network, { onBetter });
      if (result.status === "notFound" && alive) {
        await new Promise((resolve) => setTimeout(resolve, NOT_FOUND_RETRY_MS));
        if (alive) result = await fetchPaymentLink(link, network, { onBetter });
      }
      if (!alive) return;
      if (result.status === "found") setLookup({ phase: "found", link: better ?? result.value });
      else setLookup({ phase: result.status });
    })();
    return () => {
      alive = false;
    };
  }, [link, attempt]);

  // While the link has no final version, a subscription stays open to its final versions: one
  // published since (the owner canceled the sale, another device settled it)
  // replaces the copy shown as soon as a relay takes it, and nothing is followed any more.
  const watchOwner = link?.kind === "sale" && sale !== null && final === null ? sale.owner : null;
  useEffect(() => {
    if (link?.kind !== "sale" || watchOwner === null) return;
    const network = invoiceNetwork();
    return watchWhileActive(() =>
      watchLinkFinal(link, watchOwner, network, (copy) => setLookup({ phase: "found", link: copy }))
    );
  }, [link, watchOwner]);

  // The rate of the sale's currency: the page fixes the amounts of its own invoices.
  const rate = useRate(sale && !final ? sale.fiat.currency : null);
  // The sale's keys: the page declares its invoices with them, and finds the point of sale's.
  const registry = useMemo(
    (): Registry | null =>
      sale && link
        ? saleRegistry(
            {
              key: sale.registryKey,
              reader: sale.registryReader,
              owner: sale.owner,
              ...(sale.registryEpoch ? { readerEpoch: sale.registryEpoch } : {})
            },
            link.key,
            // The relays its URL names: those of the point of sale that made it.
            link.relays,
            // Who took the sale, as the link says it: the page's declarations carry it, for the
            // owner, who checks it (load.ts of src/features/activity/).
            sale.taker
          )
        : null,
    [sale, link]
  );
  // Another attempt ("Try again" after a failure) starts the page's own requests afresh.
  const saleKey = `${link ? link.author : ""}|${attempt}`;
  // The screen with a code shown last for this attempt: kept, blurred, while a payment seen is
  // checked (src/components/ui/CodePlate.tsx).
  const [lastCode, setLastCode] = useState<{
    key: string;
    signature: string;
    state: CodeScreen;
  } | null>(null);

  const {
    state: tracked,
    now,
    dueNow,
    answered
  } = useSale({
    key: saleKey,
    fiat: sale?.fiat ?? { minor: 0, digits: 0, currency: "CHF" },
    rate:
      rate.rate !== undefined && rate.hour !== undefined
        ? { hour: rate.hour, rate: rate.rate }
        : null,
    // A sale of a link of version 4 (an invoice) says when it starts; one of version 3 lasts
    // V3_SALE_SECONDS from its start, which its end gives (payload.ts).
    startsAt: sale?.startsAt ?? 0,
    endsAt: sale?.endsAt ?? 0,
    address: sale?.onchainAddress ?? null,
    lightningAddress: sale?.lightningAddress ?? "",
    note: sale?.note ?? "",
    own: "all",
    // The merchant's node when the link names it (the owner passed it on to the payers' pages),
    // else mempool.space.
    explorer: sale?.bitcoinNode ?? "public",
    registry,
    awaitDeclared: true,
    active: sale !== null && final === null
  });

  // The owner's acceptance of the sale, looked for while it shows "Underpaid" (useSaleAcceptance).
  const underpaidShown =
    sale !== null &&
    (final
      ? final.status === "underpaid"
      : tracked.phase === "underpaid" || tracked.phase === "underpaidEnded");
  const acceptance = useSaleAcceptance(
    // On the relays its URL names (unset: the device's, as its lookup: link.ts).
    sale && link
      ? { saleKey: link.key, owner: sale.owner, relays: link.relays ?? currentRelays() }
      : null,
    underpaidShown
  );

  // The attempt whose first answers were waited for long enough (LINK_FIRST_CHECK_TIMEOUT_MS):
  // another one ("Try again") is waited for again.
  const waited = useWaited(
    sale !== null && final === null ? saleKey : null,
    LINK_FIRST_CHECK_TIMEOUT_MS
  );
  // Whether it was paid is not known yet: neither a code to pay nor "Request expired" meanwhile,
  // a loader (as a checkout link's page: useCheckoutLink).
  const firstAnswers = !answered && !waited;

  const followed = ((): SharedInvoiceState => {
    if (!link) return { phase: "invalid" };
    if (lookup.phase !== "found") return lookup;
    if (!sale) return { phase: "loading" };
    // When the request was made: the sale's start.
    const createdAt = sale.startsAt;
    const view = (sats: bigint | null): SharedView => ({
      businessName: sale.businessName,
      lightningAddress: sale.lightningAddress,
      fiat: sale.fiat,
      note: sale.note,
      onchainAddress: sale.onchainAddress,
      endsAt: sale.endsAt,
      // A link of version 4 only (an invoice): the page shows its due date.
      ...(sale?.version === LONG_SALE_LINK_VERSION ? { startsAt: sale.startsAt } : {}),
      // Where the invoice sends its payer once paid (its link checked it: https only).
      ...(sale?.redirectUrl ? { redirectUrl: sale.redirectUrl } : {}),
      // Where the page reads the chain: its transactions' links lead there too.
      bitcoinNode: sale.bitcoinNode,
      sats
    });
    if (final) {
      switch (final.status) {
        case "paid":
          return {
            phase: "paid",
            view: view(final.received),
            paidAt: null,
            details: finalPaidDetails(final, createdAt)
          };
        case "expired":
          return { phase: "expired", view: view(null) };
        case "canceled":
          return { phase: "canceled", view: view(null) };
        case "underpaid": {
          const onchainSats = final.onchain?.sats ?? 0n;
          return {
            phase: "underpaidEnded",
            view: view(final.due),
            due: final.due ?? 0n,
            received: final.received,
            lightning: final.received - onchainSats,
            // Published once every transaction was deep enough (useSale's settlement).
            transactions: (final.onchain?.transactions ?? []).map((tx) => ({
              ...tx,
              confirmations: REQUIRED_CONFIRMATIONS
            }))
          };
        }
      }
    }
    switch (tracked.phase) {
      case "open":
        if (firstAnswers) return { phase: "checking", bitcoin: false };
        return {
          phase: "open",
          invoice: {
            ...view(null),
            invoice: tracked.invoice,
            sats: tracked.sats,
            expiresAt: tracked.invoiceExpiresAt,
            rateHour: tracked.hour
          }
        };
      // The address is still watched (useSale): its transactions as deep as they are now,
      // confirmed once the payment counts (every transaction REQUIRED_CONFIRMATIONS deep).
      case "paid":
      case "unconfirmed": {
        const details: PaymentDetails = {
          createdAt,
          method: tracked.method,
          transactions: watchedTransactions(
            tracked.transactions,
            tracked.phase === "paid" && tracked.onchainConfirmed
          )
        };
        return tracked.phase === "paid"
          ? { phase: "paid", view: view(tracked.received), paidAt: tracked.paidAt, details }
          : { phase: "unconfirmed", view: view(tracked.received), details };
      }
      case "underpaid":
        // Another payment may be told yet (an invoice paid, made elsewhere): never a rest to pay.
        if (firstAnswers) return { phase: "checking", bitcoin: false };
        // The rest of a new hour, until its point is known.
        if (tracked.rest === null || dueNow === null) return { phase: "updating" };
        return {
          phase: "underpaid",
          view: view(dueNow),
          address: tracked.address,
          due: dueNow,
          received: tracked.received,
          rest: tracked.rest,
          restInvoice: tracked.topUp,
          receipts: tracked.receipts
        };
      case "underpaidEnded":
        return {
          phase: "underpaidEnded",
          view: view(tracked.due),
          due: tracked.due,
          received: tracked.received,
          lightning: tracked.lightning,
          transactions: tracked.transactions
        };
      case "expired":
        return { phase: "expired", view: view(null) };
      case "disputed":
        return { phase: "disputed", view: view(null) };
      case "failed":
        return tracked.failure === "network"
          ? { phase: "unreachable" }
          : {
              phase: "failed",
              failure: tracked.failure,
              onchainOnly: tracked.onchain !== undefined,
              businessName: sale.businessName
            };
      case "creating":
        // Until the first answer of the rate's source, the invoice is being made, as far as the
        // payer knows; then without a point for this hour, an outage of the rate.
        return tracked.waitingForRate && !rate.loading
          ? { phase: "updating" }
          : { phase: "creating" };
      case "checking": {
        // A payment seen while the sale lasts: the screen shown last stays, its code blurred, its
        // countdown going on (the sale goes on if the payment does not count), as at the point of
        // sale.
        const kept = lastCode?.key === saleKey ? lastCode.state : null;
        if (tracked.paymentSeen && now < sale.endsAt && kept) {
          return { ...kept, checking: { bitcoin: tracked.bitcoin } };
        }
        // Nothing received: the request ended, a payment of its invoices may still be reported.
        // The amount of the invoice shown last, if any: the payer saw it. Not before the first
        // answers: a payment may be told at once (a payer who comes back).
        if (!tracked.paymentSeen) {
          if (firstAnswers) return { phase: "checking", bitcoin: false };
          return {
            phase: "ended",
            view: view(kept?.phase === "open" ? kept.invoice.sats : null),
            bitcoin: tracked.bitcoin,
            lateUntil: tracked.lateUntil
          };
        }
        return { phase: "checking", bitcoin: tracked.bitcoin };
      }
    }
  })();
  // Accepted by the business: paid at what was received, while that still reaches what it had
  // received when accepted (a replacement, RBF, that pays less leaves it underpaid).
  const state: SharedInvoiceState =
    acceptance &&
    (followed.phase === "underpaid" || followed.phase === "underpaidEnded") &&
    followed.received >= acceptance.received
      ? {
          phase: "accepted",
          view: { ...followed.view, sats: followed.received },
          received: followed.received
        }
      : followed;
  const codeScreen = codeScreenOf(state);
  if (
    codeScreen !== null &&
    (lastCode?.key !== saleKey || lastCode.signature !== codeScreen.signature)
  ) {
    setLastCode({ key: saleKey, ...codeScreen });
  }

  return {
    state,
    now,
    retry: () => {
      setLookup({ phase: "loading" });
      setAttempt((a) => a + 1);
    }
  };
}
