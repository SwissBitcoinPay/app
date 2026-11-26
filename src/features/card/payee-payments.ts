import { useEffect, useState } from "react";
import { Platform } from "react-native";

import type { WalletPayment } from "@/lib/breez/types";
import type { ApprovedPayee } from "@/lib/card/payee-book";
import {
  CARD_PAYMENTS_KEPT_MS,
  identifiedPayeeOf,
  type CardPaymentEntry,
  type CardPaymentOutcome
} from "@/lib/card/payment-entry";
import { loadCardPayments } from "@/lib/card/payment-log";
import { bolt11PayeeNode } from "@/lib/lightning/bolt11";
import { logFailure } from "@/lib/log/log";

import {
  leaseCardWallet,
  listCardWalletPayments,
  readCardWallet,
  type CardWalletOf
} from "./card-wallet";
import { readCardHistory } from "./history-sync";
import { historyRows, type CardHistoryRow } from "./history-view";
import { withCardAccess, type CardAccess } from "./states";

/*
 * What "Payments without confirmation" says of each merchant approved for a card: how many payments
 * the card made there since its approval, and for how much. Read as "History" reads them: the
 * phone's log (its payments not published yet), the account's relays (every device's, their 90
 * days), and the card's wallet, synced, whose Lightning payments are its payments at a point of
 * sale whichever device sent them (card-movement.ts). The wallet
 * tells whether a payment left: one the log says sent may still be pending there, or have failed
 * since (payment.ts notes it sent once the wallet took it). A merchant is its address: a payment
 * counts once the point of sale proved it went there (an identified merchant) and the wallet shows
 * it completed. A merchant identified by its node is that node: a payment counts once its invoice,
 * kept in its record, is signed by it, whoever the point of sale said it was for. The count is
 * said only when it is proven whole, every source read (a majority of the relays whole): no
 * payment since the approval that may have left went to a merchant not identified (an
 * "Automatic" payment, a point of sale without proof: it may have been this one), is still
 * pending or untold by the wallet, or left the wallet told by no record of a payment (another
 * device's, not published yet: a refusal of the same invoice tells none, a point of sale presents it
 * again). It is the count of the moment the payments were read: a merchant approved since has none
 * until they are read again. A merchant approved longer ago than those 90 days has its count said
 * as theirs ("in 90 days"): its months' copies are not read for this.
 */

/** A merchant's payments with the card since its approval: the paid ones, never a refusal. */
export type PayeeTally = {
  count: number;
  sats: bigint;
  /** Since its approval (true), or within the last 90 days only (approved before them). */
  whole: boolean;
};

export type PayeePayments =
  | { status: "reading" }
  /**
   * No majority of the relays answered whole, or the phone's log or the card's wallet could not be
   * read: nothing is said.
   */
  | { status: "unknown" }
  /** By id (address or node): only the merchants whose count is proven whole. */
  | { status: "read"; tallies: ReadonlyMap<string, PayeeTally> };

/** A payment the card's wallet sent at a point of sale: when (ms), its hash, where it stands. */
export type WalletSend = {
  at: number;
  paymentHash: string | null;
  status: WalletPayment["status"];
};

/**
 * How long before an approval a payment told by no record may have come after it all the same: its
 * time is the wallet's, the approval's the holder's device's.
 */
const CLOCK_TOLERANCE_MS = 5 * 60_000;

/** A payment of these outcomes may have left: its record tells the wallet's send of its hash. */
const MAY_HAVE_LEFT: ReadonlySet<CardPaymentOutcome> = new Set(["sending", "sent", "uncertain"]);

/** Of two sends of one hash, the one that tells the most left: completed, then pending. */
const LEFT_RANK: Record<WalletPayment["status"], number> = { failed: 0, pending: 1, completed: 2 };

/**
 * The card's payments at a point of sale among its wallet's `payments` (card-movement.ts), and
 * what it sent that the SDK cannot tell (WalletPayment.network): without a hash, it may have gone
 * anywhere, a count since then is not proven.
 */
export function walletSends(payments: readonly WalletPayment[]): WalletSend[] {
  return payments.flatMap((payment) =>
    payment.direction === "send" &&
    (payment.network === "lightning" || payment.network === "unknown")
      ? [
          {
            at: payment.timestamp * 1000,
            paymentHash: payment.paymentHash?.toLowerCase() ?? null,
            status: payment.status
          }
        ]
      : []
  );
}

/** The node a payment's invoice pays (its signer), null without a key. */
function paidNode(entry: CardPaymentEntry): string | null {
  return bolt11PayeeNode(entry.pr);
}

/** The address a payment went to, when the point of sale proved it: a merchant identified by it. */
function identifiedAddress(entry: CardPaymentEntry): string | null {
  // Without metadata, no address: its invoice's signer is not recovered for nothing (paidNode).
  if (!entry.payee?.metadata) return null;
  const identified = identifiedPayeeOf(entry);
  return identified?.by === "address" ? identified.id : null;
}

/**
 * Each approved merchant's payments among the card's `rows` (historyRows, every tap known) and its
 * wallet's `sends`, all read at `readAt` (ms): those to its address (or node) since its approval
 * and `horizon` that the wallet shows completed, each invoice once. None for a merchant whose count is
 * not proven whole by them, nor for one approved after `readAt`.
 */
export function tallyPayeePayments(
  rows: readonly CardHistoryRow[],
  approved: readonly ApprovedPayee[],
  horizon: number,
  sends: readonly WalletSend[],
  readAt: number
): Map<string, PayeeTally> {
  const taps = rows.flatMap((row) => (row.kind === "tap" ? [row.entry] : []));
  // Where the wallet tells each invoice it paid stands.
  const wallet = new Map<string, WalletPayment["status"]>();
  for (const { paymentHash, status } of sends) {
    if (paymentHash === null) continue;
    const known = wallet.get(paymentHash);
    if (known === undefined || LEFT_RANK[status] > LEFT_RANK[known]) {
      wallet.set(paymentHash, status);
    }
  }
  const payers = taps.filter((entry) => MAY_HAVE_LEFT.has(entry.outcome));
  const told = new Set(payers.map((entry) => entry.paymentHash));
  // Left, or leaving, told by no record of a payment (another device's, not published yet): it may
  // have gone anywhere.
  const untold = sends.filter(
    (send) => send.status !== "failed" && (send.paymentHash === null || !told.has(send.paymentHash))
  );
  // Each invoice's signer recovered once, for the merchants identified by their node only.
  const nodes = new Map<CardPaymentEntry, string | null>();
  const nodeOf = (entry: CardPaymentEntry): string | null => {
    if (!nodes.has(entry)) nodes.set(entry, paidNode(entry));
    return nodes.get(entry) ?? null;
  };
  const tallies = new Map<string, PayeeTally>();
  for (const payee of approved) {
    if (payee.approvedAt > readAt) continue;
    const since = Math.max(payee.approvedAt, horizon);
    let proven = !untold.some((send) => send.at + CLOCK_TOLERANCE_MS >= since);
    const counted = new Map<string, bigint>();
    for (const entry of payers) {
      if (entry.at < since) continue;
      const left = wallet.get(entry.paymentHash);
      // The wallet tells it did not leave.
      if (left === "failed") continue;
      const id = payee.by === "node" ? nodeOf(entry) : identifiedAddress(entry);
      if (id !== null && id !== payee.id) continue;
      if (id === null || left !== "completed") {
        // It may have gone there, or still go: not proven either way.
        proven = false;
        continue;
      }
      counted.set(entry.paymentHash, entry.amountSats);
    }
    if (!proven) continue;
    let sats = 0n;
    for (const amount of counted.values()) sats += amount;
    tallies.set(payee.id, {
      count: counted.size,
      sats,
      whole: payee.approvedAt >= horizon
    });
  }
  return tallies;
}

/** The card's wallet's payments at a point of sale, synced first (card-wallet.ts). */
async function readWalletSends(access: CardAccess, card: CardWalletOf): Promise<WalletSend[]> {
  const lease = await leaseCardWallet(access, card);
  try {
    // Synced first: its storage alone may miss its latest payments.
    await readCardWallet(lease);
    return walletSends(await listCardWalletPayments(lease));
  } finally {
    await lease.release();
  }
}

/**
 * The payments of `card` (its wallet: CardWalletOf) to the merchants `approved` for it, read once
 * `approved` is known (null while it is read), again with `round`, and again once a merchant was
 * approved after the read: its payments since are read then.
 */
export function usePayeePayments(
  card: CardWalletOf,
  approved: readonly ApprovedPayee[] | null,
  round: number
): PayeePayments {
  const { cardId, walletGeneration } = card;
  const [read, setRead] = useState<{
    key: string;
    rows: CardHistoryRow[];
    horizon: number;
    sends: WalletSend[];
    readAt: number;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // The latest approval: a later one is read anew.
  let latest = 0;
  for (const payee of approved ?? []) latest = Math.max(latest, payee.approvedAt);
  const known = approved !== null;
  const key = `${cardId}/${walletGeneration}/${round}/${latest}`;
  const onWeb = Platform.OS === "web";

  useEffect(() => {
    if (!known) return;
    let alive = true;
    const readAt = Date.now();
    const horizon = readAt - CARD_PAYMENTS_KEPT_MS;
    // The phone's log holds its payments not published yet: unread (a newer app's), no count is
    // proven.
    const own = onWeb ? Promise.resolve([]) : loadCardPayments();
    const sources = withCardAccess(async (access) => {
      // Both end before the access does (its keys wiped then).
      const [history, sends] = await Promise.allSettled([
        readCardHistory(access),
        readWalletSends(access, { cardId, walletGeneration })
      ]);
      if (history.status === "rejected") throw history.reason;
      if (sends.status === "rejected") throw sends.reason;
      return { history: history.value, sends: sends.value };
    });
    Promise.all([own, sources]).then(
      ([log, { history, sends }]) => {
        if (!alive) return;
        if (!history.conclusive) {
          setFailedFor(key);
          return;
        }
        // Every tap known, of whatever age: a payment of the wallet is told by its own.
        const rows = historyRows({
          card: { cardId, walletGeneration },
          horizon: 0,
          own: log,
          taps: history.recorded.taps,
          movements: [],
          wallet: null
        });
        setRead({ key, rows, horizon, sends, readAt });
      },
      (error: unknown) => {
        logFailure("Counting a card's payments to its merchants failed", error);
        if (alive) setFailedFor(key);
      }
    );
    return () => {
      alive = false;
    };
  }, [cardId, walletGeneration, key, known, onWeb]);

  if (failedFor === key) return { status: "unknown" };
  if (read?.key !== key || approved === null) return { status: "reading" };
  return {
    status: "read",
    tallies: tallyPayeePayments(read.rows, approved, read.horizon, read.sends, read.readAt)
  };
}
