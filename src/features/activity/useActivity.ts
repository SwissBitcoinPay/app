import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { sentLinks, withInvoices } from "@/features/invoices/activity";
import { rememberOwnerRows } from "@/features/invoices/rows";
import { refreshInvoices, useInvoices } from "@/features/invoices/store";
import { readLegacyHistory, subscribeHistoryChanges } from "@/features/migration/history-import";
import { askOwnerFinals } from "@/features/payment-link/finals-wake";
import { watchWhileActive } from "@/features/relays/live-watch";
import { openTeam } from "@/features/team/owner";
import type { Roster } from "@/features/team/roster";
import { readMtpSales } from "@/features/sell/sale-records";
import { usePointOfSale, usePos } from "@/features/terminal/pos";
import { useBusinessRegistry } from "@/features/terminal/registry-key";
import { everyPaymentSince, LIST_LIMIT } from "@/features/wallet/model";
import { useWalletData } from "@/features/wallet/useWalletData";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import { nowUnix } from "@/lib/clock";
import type { Invoice } from "@/lib/invoice/record";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";
import { deriveLinkOwner, type TeamKeys } from "@/lib/team/keys";
import { isMemberProfile } from "@/lib/terminal/model";

import type { AcceptanceReader } from "./acceptance";
import type { AddressReads, IntegrationOrder, WalletView } from "./integration-orders";
import {
  loadDeclarations,
  loadIntegrationOrders,
  loadMemberActivity,
  loadOnchainSales,
  loadOwnerRecords,
  loadRecoveredTransactions,
  type MemberActivityData,
  type OwnerRecords
} from "./load";
import {
  linksAwaitingFinal,
  memberActivity,
  nextEnd,
  ownerActivity,
  removedKey,
  type ActivityBy,
  type ActivityItem,
  type DeclaredSale,
  type LinkInfo,
  type RecordedSale,
  type RemovedBy
} from "./model";
import { depositTxid } from "./onchain-sales";
import { legacyHistoryItems, listWindow } from "./legacy-history";
import { ownerLiveWatch, settled, watchOwnerActivity, type LiveSource } from "./live";
import { useAcceptances } from "./useAcceptances";

/**
 * While the screen shows, the employees' records and links are read again this often: each read
 * goes through every employee's month of records (paged), slower than the wallet's own storage.
 */
export const ACTIVITY_REFRESH_MS = 60_000;

/** A read of the registry without a majority's answer is tried again this much later. */
export const ACTIVITY_RETRY_MS = 30_000;

const NONE_SALES: readonly RecordedSale[] = [];
const NONE_LINKS: readonly LinkInfo[] = [];
const NO_LINKS: ReturnType<typeof sentLinks> = [];
const NO_ORDERS: readonly IntegrationOrder[] = [];
const NO_ITEMS: readonly ActivityItem[] = [];

/** setTimeout's longest delay (a signed 32-bit number of milliseconds). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * When the rows are judged (an invoice or a link "Open" until its end): a state only changes at an
 * end, so the time is set in state once each end of `sales` and `links` passed, without waiting for
 * a read (ACTIVITY_REFRESH_MS). An end already passed when its data comes (the React Compiler may
 * keep `now` from an earlier render) sets it at once.
 */
function useActivityNow(sales: readonly RecordedSale[], links: readonly LinkInfo[]): number {
  const [passed, setPassed] = useState(0);
  const now = Math.max(nowUnix(), passed);
  const next = nextEnd(sales, links, now);
  useEffect(() => {
    if (next === null) return;
    const delay = Math.min(Math.max(0, next - nowUnix()) * 1000 + 250, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => setPassed(Math.max(nowUnix(), next)), delay);
    return () => clearTimeout(timer);
  }, [next]);
  return now;
}

/**
 * The payments received (but failed ones), as `hash:at`: each hash once, at its earliest date, as
 * the owner's copy of the declarations groups them by month (archive.ts). Their declarations tell
 * their sales (loadDeclarations).
 */
export function receivedPayments(payments: readonly WalletPayment[]): Map<string, number> {
  const received = new Map<string, number>();
  for (const payment of payments) {
    if (payment.direction === "receive" && payment.paymentHash && payment.status !== "failed") {
      const known = received.get(payment.paymentHash);
      received.set(payment.paymentHash, Math.min(known ?? Infinity, payment.timestamp));
    }
  }
  return received;
}

/**
 * The deposits received (but failed ones), as `txid:at`: each transaction once, at its earliest
 * date. Their sales, when an integration's order leased the address, come from the registry
 * (onchain-sales.ts).
 */
export function receivedDeposits(
  payments: readonly WalletPayment[],
  deposits: readonly PendingDeposit[]
): Map<string, number> {
  const received = new Map<string, number>();
  for (const payment of payments) {
    // A transaction id (hex): anything else names no witness, and would break the `txid:at` keys.
    const txid = depositTxid(payment);
    if (txid !== null)
      received.set(txid, Math.min(received.get(txid) ?? Infinity, payment.timestamp));
  }
  // Received at 3 confirmations but not credited yet: an integration's sale shows paid all the
  // same (model.ts). The wallet gives them no date: asked as of the start of today (the same
  // `txid:at` at each read of the wallet), their witnesses looked for from WITNESS_LOOKBACK_SECONDS
  // before it, as a deposit claimed today.
  const today = Math.floor(nowUnix() / DAY_SECONDS) * DAY_SECONDS;
  for (const deposit of deposits) {
    if (deposit.mature && !received.has(deposit.txid)) received.set(deposit.txid, today);
  }
  return received;
}

/**
 * Who "By" names, as ownerActivity takes them (`members`, `integrations`, `removed`): the team as
 * the roster has it (its assistants among the members, said to be assistants), with the photos the
 * records' last read gave and the integrations' platforms (their logos); an employee removed since
 * that read vouches only for a sale paid before its removal (model.ts, markVouches), by its name.
 * Empty while the roster was not read (`records` null, or its roster): no employee's nor
 * integration's mark vouches for a sale then.
 */
export function activityPeople(
  records: OwnerRecords | null
): Pick<Parameters<typeof ownerActivity>[0], "members" | "integrations" | "removed"> {
  const roster = records?.roster ?? null;
  return {
    members: new Map([
      ...(roster?.employees ?? []).map(({ id, name }): [string, ActivityBy] => [
        id,
        records?.members.get(id) ?? { kind: "member", id, name }
      ]),
      // An assistant's mark is a member's (takers.ts): "By" names it, as an assistant.
      ...(roster?.assistants ?? []).map(({ id, name }): [string, ActivityBy] => [
        id,
        { kind: "member", id, name, assistant: true }
      ])
    ]),
    integrations: new Map(
      (roster?.integrations ?? []).map(({ id, name, platform }): [string, ActivityBy] => [
        id,
        { kind: "integration", id, name, platform }
      ])
    ),
    removed: new Map(
      (roster?.removed ?? []).map(({ role, id, name, removedAt, platform }): [string, RemovedBy] =>
        role === "integration"
          ? [
              removedKey("integration", id),
              { removedAt, by: { kind: "integration", id, name, platform } }
            ]
          : [
              removedKey("member", id),
              {
                removedAt,
                by: {
                  kind: "member",
                  id,
                  name,
                  ...(role === "assistant" ? { assistant: true } : {})
                }
              }
            ]
      )
    )
  };
}

const DAY_SECONDS = 24 * 3600;

/**
 * What the wallet tells of the integrations' orders (integration-orders.ts): the deposits it
 * claimed, the Lightning payments it received, and since when it lists every payment (once synced:
 * `lastDays` holds every payment of its window).
 */
function walletViewOf(
  data: NonNullable<ReturnType<typeof useWalletData>["data"]>,
  synced: boolean
): WalletView {
  const claimed = new Set<string>();
  const lightning = new Set<string>();
  for (const payment of [...data.lastDays, ...data.payments]) {
    if (payment.direction !== "receive" || payment.status !== "completed") continue;
    if (payment.network === "bitcoin" && payment.txId) claimed.add(payment.txId.toLowerCase());
    if (payment.network === "lightning" && payment.paymentHash) lightning.add(payment.paymentHash);
  }
  return { claimed, lightning, completeSince: synced ? data.since : null };
}

/**
 * "Wallet": the wallet (useWalletData: its connection, sync and payments, read every 15 s) and what
 * the relays add to it: the registry's declaration of each payment received (read once per payment)
 * and the employees' sales and links (read every ACTIVITY_REFRESH_MS). `items` waits for the first
 * of both reads (or their failure), so that the rows do not regroup under a finger.
 *
 * About `listLimit` movements, the newest (listWindow), the history copied from the v2 account
 * among them: "Show more" asks LIST_LIMIT more. The rows of the older payments it reads show once
 * their sales were asked too (`loadingMore` meanwhile, the list as it was), as the first ones: they
 * would otherwise regroup under a finger.
 */
export function useOwnerActivity(listLimit: number = LIST_LIMIT) {
  const wallet = useWalletData(listLimit);
  const focused = useIsFocused();
  // The invoices of "New invoice" (src/features/invoices/): their links are read whatever their
  // age, drafts and sent invoices show among the rows.
  const invoices = useInvoices(focused && wallet.connected);
  const invoiceLinks =
    invoices.status === "ready" ? sentLinks(invoices.invoices, invoices.authors) : NO_LINKS;
  const invoiceLinksKey = invoiceLinks.map(({ id }) => id).join(",");
  // The business's links name it: an employee's link of another one is left out (load.ts). An empty
  // address is none known ("Open with my 12 words", RescueScreen.tsx): the links are then told by
  // the business's keys alone.
  const lightningAddress = usePointOfSale().profile.lightningAddress || null;
  const linksRef = useRef(invoiceLinks);
  useEffect(() => {
    linksRef.current = invoiceLinks;
  });
  const [records, setRecords] = useState<OwnerRecords | null>(null);
  const [recordsRead, setRecordsRead] = useState(false);
  // The reads the live watch asks again (live.ts): set by the effects that make them.
  const readRecords = useRef<(() => void) | null>(null);
  const readOrders = useRef<(() => void) | null>(null);
  // Declarations by payment hash, read once each: a payment's sale never changes.
  const [declared, setDeclared] = useState<ReadonlyMap<string, DeclaredSale[]>>(new Map());
  // A read of the declarations ended (those without a majority's answer show as the wallet has
  // them, asked again ACTIVITY_RETRY_MS later).
  const [declarationsTried, setDeclarationsTried] = useState(false);
  const [declarationsRetry, setDeclarationsRetry] = useState(0);
  // The payments (by hash) and deposits (by txid) whose sales a read ended for, found or not: the
  // rows "Show more" brings wait for theirs (see above).
  const [triedHashes, setTriedHashes] = useState<ReadonlySet<string>>(new Set());
  const [triedTxids, setTriedTxids] = useState<ReadonlySet<string>>(new Set());
  // The sales of deposits by txid (an integration's order that leased the address), read once each.
  const [onchainSales, setOnchainSales] = useState<ReadonlyMap<string, DeclaredSale[]>>(new Map());
  // The history copied from the v2 account (legacy-history.ts), read again once a copy wrote it:
  // never awaited by the list, which shows without it until it is read.
  const [legacy, setLegacy] = useState<readonly ActivityItem[]>(NO_ITEMS);
  const [legacyWrites, setLegacyWrites] = useState(0);
  useEffect(() => subscribeHistoryChanges(() => setLegacyWrites((count) => count + 1)), []);
  const [onchainTried, setOnchainTried] = useState(false);
  const [onchainRetry, setOnchainRetry] = useState(0);

  useEffect(() => {
    if (!focused || !wallet.connected) return;
    let alive = true;
    // A month of every employee's records, page by page, may take longer than the interval: one
    // read at a time, so that an older one never replaces a newer one's data. Asked while one runs
    // (the live watch), once more after it: what was asked for may have come after its answers.
    let reading = false;
    let again = false;
    const read = () => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      loadOwnerRecords(nowUnix(), lightningAddress, linksRef.current)
        .then(
          (next) => {
            if (!alive) return;
            setRecords(next);
            setRecordsRead(true);
          },
          (error: unknown) => {
            logFailure("Reading the employees' records failed", error);
            if (alive) setRecordsRead(true);
          }
        )
        .finally(() => {
          reading = false;
          if (again && alive) {
            again = false;
            read();
          }
        });
    };
    read();
    readRecords.current = read;
    const timer = setInterval(read, ACTIVITY_REFRESH_MS);
    return () => {
      alive = false;
      readRecords.current = null;
      clearInterval(timer);
    };
    // Read again when an invoice is sent (its link to read), not at each render of the list.
  }, [focused, wallet.connected, lightningAddress, invoiceLinksKey]);

  useEffect(() => {
    if (!focused || !wallet.connected) return;
    let alive = true;
    void readLegacyHistory().then((history) => {
      if (alive && history) setLegacy(legacyHistoryItems(history.rows));
    });
    return () => {
      alive = false;
    };
  }, [focused, wallet.connected, legacyWrites]);

  const data = wallet.connected ? wallet.data : null;
  const missing = [...receivedPayments(data?.payments ?? [])].filter(
    ([hash]) => !declared.has(hash)
  );
  const missingKey = missing.map(([hash, at]) => `${hash}:${at}`).join(",");
  const hasData = data !== null;
  useEffect(() => {
    if (!focused || !hasData || missingKey === "") return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Not restarted by the wallet's reads (every 15 s): a read of many payments, 50 at a time,
    // each waiting for the slowest relay, may take longer. A new payment restarts it, with every
    // hash still missing: what a read restarted meanwhile found is kept all the same (a payment's
    // sale never changes), else a busy shop's reads would never end and the list never show.
    const asked = missingKey.split(",").map((entry) => {
      const [hash, at] = entry.split(":");
      return { hash: hash!, at: Number(at) };
    });
    const tried = () => {
      setDeclarationsTried(true);
      setTriedHashes((known) => new Set([...known, ...asked.map(({ hash }) => hash)]));
    };
    loadDeclarations(asked).then(
      (found) => {
        tried();
        if (found) setDeclared((known) => new Map([...known, ...found]));
        else if (alive) {
          retry = setTimeout(() => setDeclarationsRetry((n) => n + 1), ACTIVITY_RETRY_MS);
        }
      },
      (error: unknown) => {
        logFailure("Reading the registry failed", error);
        tried();
        if (alive) retry = setTimeout(() => setDeclarationsRetry((n) => n + 1), ACTIVITY_RETRY_MS);
      }
    );
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [focused, hasData, missingKey, declarationsRetry]);

  const missingDeposits = [...receivedDeposits(data?.payments ?? [], data?.deposits ?? [])].filter(
    ([txid]) => !onchainSales.has(txid)
  );
  const missingDepositsKey = missingDeposits.map(([txid, at]) => `${txid}:${at}`).join(",");
  useEffect(() => {
    if (!focused || !hasData || missingDepositsKey === "") return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      if (alive) retry = setTimeout(() => setOnchainRetry((n) => n + 1), ACTIVITY_RETRY_MS);
    };
    // As the declarations above: what a read restarted meanwhile found is kept (a deposit's sale
    // never changes); those it could not decide are asked again.
    const asked = missingDepositsKey.split(",").map((entry) => {
      const [txid, at] = entry.split(":");
      return { txid: txid!, at: Number(at) };
    });
    const tried = () => {
      setOnchainTried(true);
      setTriedTxids((known) => new Set([...known, ...asked.map(({ txid }) => txid)]));
    };
    loadOnchainSales(asked).then(
      (found) => {
        tried();
        if (!found) return again();
        setOnchainSales((known) => new Map([...known, ...found.sales]));
        if (found.retry.length > 0) again();
      },
      (error: unknown) => {
        logFailure("Reading the deposits' sales failed", error);
        tried();
        again();
      }
    );
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [focused, hasData, missingDepositsKey, onchainRetry]);

  // The transactions that brought funds back to the wallet (funds-recovery.ts): their deposits are
  // "Funds recovered", never a sale nor a reception. Read when a deposit none names yet comes (not
  // at each read of the wallet); the rows do not wait for it: unread, such a deposit shows as a
  // reception, never as a sale (no sale's address receives it).
  const [recovered, setRecovered] = useState<ReadonlyMap<string, bigint>>(new Map());
  const account = usePos().profile;
  const walletId = wallet.connected && !isMemberProfile(account) ? account.walletId : null;
  const unnamedDepositsKey = [
    ...receivedDeposits(data?.payments ?? [], data?.deposits ?? []).keys()
  ]
    .filter((txid) => !recovered.has(txid))
    .sort()
    .join(",");
  useEffect(() => {
    if (!focused || !walletId || unnamedDepositsKey === "") return;
    let alive = true;
    loadRecoveredTransactions(walletId).then(
      (found) => {
        if (alive && found) setRecovered((known) => new Map([...known, ...found]));
      },
      (error: unknown) => {
        logFailure("Reading the recovered funds failed", error);
      }
    );
    return () => {
      alive = false;
    };
  }, [focused, walletId, unnamedDepositsKey]);

  // The sales to Mt Pelerin the wallet's sendings paid (sale-records.ts): their rows a sale to Mt
  // Pelerin, with the sale as agreed in their details. Read for the sendings listed whose record
  // was not looked for yet (not at each read of the wallet), until a majority of the relays
  // answered for them; the rows do not wait for it: unread, a sale shows as the sending it is.
  const [mtpSales, setMtpSales] = useState<ReadonlyMap<string, MtpSaleRecord>>(new Map());
  const [saleHashesRead, setSaleHashesRead] = useState<ReadonlySet<string>>(new Set());
  const unreadSalesKey = [
    ...new Set(
      (data?.payments ?? []).flatMap((payment) =>
        payment.direction === "send" && payment.paymentHash ? [payment.paymentHash] : []
      )
    )
  ]
    .filter((hash) => !saleHashesRead.has(hash))
    .sort()
    .join(",");
  useEffect(() => {
    if (!focused || !walletId || unreadSalesKey === "") return;
    let alive = true;
    const hashes = unreadSalesKey.split(",");
    readMtpSales(hashes).then(
      ({ sales: found, complete }) => {
        if (!alive) return;
        if (found.size > 0) setMtpSales((known) => new Map([...known, ...found]));
        // Without a majority's answer, the hashes without a record are asked again at the next
        // focus of the screen.
        const read = complete ? hashes : [...found.keys()];
        if (read.length > 0) setSaleHashesRead((known) => new Set([...known, ...read]));
      },
      (error: unknown) => {
        logFailure("Reading the Mt Pelerin sales failed", error);
      }
    );
    return () => {
      alive = false;
    };
  }, [focused, walletId, unreadSalesKey]);

  // The integrations' orders paid on-chain not final yet ("Confirming", "Underpaid"): the wallet
  // knows nothing of them before it claims their deposits. Read when the wallet's data comes, again
  // once it is synced (an order with a Lightning invoice is told only then), and every
  // ACTIVITY_REFRESH_MS, with the wallet's last read. The list does not wait for them: an order's
  // row comes when read. A read without a majority's answer, or failing, keeps the orders read. The
  // wallet's last read, told (walletViewOf) only when the orders are read, not at each render.
  const walletRead = useRef<{ data: typeof data; synced: boolean }>({ data, synced: false });
  const synced = wallet.synced;
  useEffect(() => {
    walletRead.current = { data, synced };
  });
  const [orders, setOrders] = useState<readonly IntegrationOrder[]>(NO_ORDERS);
  // What the explorer listed at the orders' addresses (readIntegrationOrders): an address whose
  // orders can no longer change is not asked again, one the explorer fails shows as last read.
  const addressReads = useRef<AddressReads>(new Map());
  useEffect(() => {
    if (!focused || !hasData) return;
    let alive = true;
    // One read at a time: witnesses, leases, then the explorer may take longer than the interval.
    // Asked while one runs (the live watch), once more after it, as the records.
    let reading = false;
    let again = false;
    const read = () => {
      const { data: last, synced: lastSynced } = walletRead.current;
      if (!last) return;
      if (reading) {
        again = true;
        return;
      }
      const view = walletViewOf(last, lastSynced);
      reading = true;
      loadIntegrationOrders(view, addressReads.current)
        .then(
          (found) => {
            if (alive && found) setOrders(found);
          },
          (error: unknown) => {
            logFailure("Reading the integrations' orders failed", error);
          }
        )
        .finally(() => {
          reading = false;
          if (again && alive) {
            again = false;
            read();
          }
        });
    };
    read();
    readOrders.current = read;
    const timer = setInterval(read, ACTIVITY_REFRESH_MS);
    return () => {
      alive = false;
      readOrders.current = null;
      clearInterval(timer);
    };
  }, [focused, hasData, synced]);

  // Live (live.ts): a new record of an author of the list asks its read again at once. The
  // authors follow the roster as the records' last read gave it.
  const liveRoster = records?.roster ?? null;
  const liveKey = liveRoster === null ? "" : rosterKey(liveRoster);
  useEffect(() => {
    if (!focused || !wallet.connected) return;
    const watch = ownerLiveWatch();
    if (!watch) return;
    const asks: Record<LiveSource, ReturnType<typeof settled>> = {
      records: settled(() => readRecords.current?.()),
      invoices: settled(() => void refreshInvoices()),
      orders: settled(() => readOrders.current?.())
    };
    const stop = watchWhileActive(() =>
      watchOwnerActivity(watch.authors, watch.relays, (source) => asks[source].request())
    );
    return () => {
      stop();
      for (const ask of Object.values(asks)) ask.cancel();
    };
  }, [focused, wallet.connected, liveKey]);

  const links = records?.links ?? NONE_LINKS;
  const sales = records?.sales ?? NONE_SALES;
  const now = useActivityNow(sales, links);
  // The payments listed: those of the last read, or of the list as it was while "Show more"'s rows
  // wait for their sales (see above).
  const [shownLimit, setShownLimit] = useState(listLimit);
  const caughtUp =
    missing.every(([hash]) => triedHashes.has(hash)) &&
    missingDeposits.every(([txid]) => triedTxids.has(txid));
  if (data && data.listLimit !== shownLimit && (data.listLimit < shownLimit || caughtUp)) {
    setShownLimit(data.listLimit);
  }
  const payments =
    data && data.payments.length > shownLimit ? data.payments.slice(0, shownLimit) : data?.payments;
  // All the wallet has: every payment it read, and it read them all.
  const listedAll = data !== null && data.listedAll && data.payments.length <= shownLimit;
  // Nothing to ask for the payments listed (none received, or every one read already): tried. Those
  // "Show more" reads never take the list away meanwhile.
  const ready =
    data !== null &&
    recordsRead &&
    (declarationsTried ||
      [...receivedPayments(payments ?? []).keys()].every((hash) => declared.has(hash))) &&
    (onchainTried ||
      [...receivedDeposits(payments ?? [], data.deposits ?? []).keys()].every((txid) =>
        onchainSales.has(txid)
      ));
  // Built again only when what it is built from changes (useMemo): the rows' identity tells the
  // acceptances' read (useAcceptances) and an invoice's details (rows.ts) that nothing changed.
  const deposits = data?.deposits;
  const built: ActivityItem[] | null = useMemo(
    () =>
      ready
        ? ownerActivity({
            payments: payments ?? [],
            declarations: declared,
            onchainSales,
            deposits: deposits ?? [],
            links,
            sales,
            ...activityPeople(records),
            integrationOrders: orders,
            recovered,
            mtpSales,
            now
          })
        : null,
    [
      ready,
      payments,
      declared,
      onchainSales,
      deposits,
      links,
      sales,
      records,
      orders,
      recovered,
      mtpSales,
      now
    ]
  );
  useAskOwnerFinals(built, links, focused);
  // The owner's acceptances of its sales "Underpaid" (acceptance.ts).
  const accepted = useAcceptances(built, ownerAcceptanceReader(), focused && wallet.connected);
  const listed = accepted.items;
  // The invoices read too (or their read failed: the rows show without them), so that rows do not
  // regroup under a finger when they come.
  const list =
    listed === null || invoices.status === "loading"
      ? null
      : listWindow({
          items: withInvoices(listed, invoices.status === "ready" ? invoices.invoices : []),
          legacy,
          walletFrom: everyPaymentSince(payments ?? [], listedAll),
          limit: shownLimit,
          walletMore: !listedAll
        });
  const items = list?.items ?? null;
  // For an invoice's details (src/features/invoices/rows.ts).
  useEffect(() => {
    if (items && !isMemberProfile(account)) rememberOwnerRows(account.walletId, items);
  }, [items, account]);
  // What "Export" builds its rows from (src/features/wallet/export/), over the payments of the
  // period it asks: the same records, orders and invoices as the list, once the list shows.
  const exportSources: ExportSources | null =
    items === null
      ? null
      : {
          records,
          orders,
          // Not read (yet): null, never "no invoice".
          invoices: invoices.status === "ready" ? invoices.invoices : null
        };
  return {
    wallet,
    items,
    invoices,
    exportSources,
    /** Since when every movement is listed (Unix seconds; null until the list shows). */
    listedFrom: list?.listedFrom ?? null,
    /** Older movements are left out of `items`: "Show more" asks for them. */
    more: list?.more ?? false,
    /** "Show more" asked for more than the list shows yet. */
    loadingMore: listLimit > shownLimit,
    /** Reads the acceptances again: the owner just accepted a sale. */
    refreshAcceptances: accepted.refresh
  };
}

/**
 * A link of `items` paid without its final version ("Confirming", linksAwaitingFinal): the owner's
 * device settles it now rather than at its next round (finals-wake.ts), while the list shows
 * (`active`). Asked again at each read of the links (a new `links`), which askOwnerFinals lets
 * through once per link and gap.
 */
export function useAskOwnerFinals(
  items: readonly ActivityItem[] | null,
  links: readonly LinkInfo[],
  active: boolean
): void {
  const awaiting = items === null ? "" : linksAwaitingFinal(items, links).join(",");
  useEffect(() => {
    if (active && awaiting !== "") askOwnerFinals(awaiting.split(","));
  }, [active, awaiting, links]);
}

/** Who the live watch listens to, as text: it starts again when the roster's seats change. */
function rosterKey(roster: Roster): string {
  return [
    ...roster.employees.map(({ id }) => `e:${id}`),
    ...roster.assistants.map(({ id, invoicing }) => `a:${id}:${invoicing === false ? 0 : 1}`),
    ...roster.integrations.map(({ id }) => `i:${id}`),
    ...roster.removed.map(({ role, id }) => `r:${role}:${id}`)
  ].join(",");
}

/** The owner's team keys and link owner key, by team (a derivation per render would cost). */
const linkOwners = new WeakMap<TeamKeys, string>();

/**
 * Who reads the acceptances on the owner's devices: the open account's team keys and relays; null
 * without an account.
 */
function ownerAcceptanceReader(): AcceptanceReader | null {
  try {
    const { team, settings } = openTeam();
    let owner = linkOwners.get(team);
    if (owner === undefined) {
      owner = deriveLinkOwner(team).publicKey;
      linkOwners.set(team, owner);
    }
    return { owner, team, relays: settings.relays };
  } catch {
    return null;
  }
}

/**
 * What the owner's list was built from besides the wallet's payments (useOwnerActivity): the
 * employees' records and links (null when no read gave them), the integrations' orders not final
 * yet, and the invoices of "New invoice" (null while not read).
 */
export type ExportSources = {
  records: OwnerRecords | null;
  orders: readonly IntegrationOrder[];
  invoices: readonly Invoice[] | null;
};

/**
 * "My activity": this employee's sales and payment links from its own records, read when the screen
 * shows and every ACTIVITY_REFRESH_MS while it does. `failed` when no relay answered and nothing
 * was read yet: data already shown stays.
 */
export function useMemberActivity() {
  const focused = useIsFocused();
  const [data, setData] = useState<MemberActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!focused) return;
    let alive = true;
    // A month of records, page by page, may take longer than the interval: one read at a time, so
    // that an older one never replaces a newer one's data.
    let reading = false;
    const read = () => {
      if (reading) return Promise.resolve();
      reading = true;
      return loadMemberActivity(nowUnix())
        .then(
          (next) => {
            if (!alive) return;
            if (next) {
              setData(next);
              setFailed(false);
            } else setFailed(true);
          },
          (error: unknown) => {
            logFailure("Reading this employee's records failed", error);
            if (alive) setFailed(true);
          }
        )
        .finally(() => {
          reading = false;
        });
    };
    void read();
    const timer = setInterval(() => void read(), ACTIVITY_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [focused, attempt]);

  const now = useActivityNow(data?.sales ?? NONE_SALES, data?.links ?? NONE_LINKS);
  const built = data ? memberActivity({ sales: data.sales, links: data.links, now }) : null;
  // The owner's acceptances of its sales "Underpaid" (acceptance.ts), signed by the owner's key of
  // each sale, which the business's link owner key gives (its channel's).
  const registry = useBusinessRegistry(usePos().profile);
  const reader: AcceptanceReader | null = registry
    ? { owner: registry.owner, team: null, relays: currentRelays() }
    : null;
  const { items } = useAcceptances(built, reader, focused, false);
  return {
    items,
    failed: failed && data === null,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    }
  };
}
