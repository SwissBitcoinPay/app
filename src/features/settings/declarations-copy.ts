import { majority } from "@/config/registry";
import { MOVE_RECORDS_MARGIN_SECONDS } from "@/config/relays";
import { withAccountWallet } from "@/features/account/background-wallet";
import { logFailure } from "@/lib/log/log";
import { within } from "@/lib/within";
import { liveRelays } from "@/lib/relays/retired";
import { copyMovedRecords } from "@/features/settings/moved-records";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  subscribeAccount
} from "@/features/account/session";
import {
  depositTxid,
  witnessHolders,
  WITNESS_LOOKBACK_SECONDS
} from "@/features/activity/onchain-sales";
import { readRoster } from "@/features/team/roster";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { listWalletPaymentsPage, waitWalletNetworkSync } from "@/lib/breez/wallet";
import { nowUnix } from "@/lib/clock";
import { MAX_MOVES, type RelaysMove } from "@/lib/registry/moves";
import { loadRegistryMoves, saveRegistryMoves } from "@/lib/registry/moves-store";
import type { NostrKeys } from "@/lib/nostr/keys";
import { fetchWitnesses } from "@/lib/integrations/onchain-witness";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, publishAgain } from "@/lib/nostr/pool";
import type { RelayChannel } from "@/lib/nostr/relay";
import { ownerLeasesOf, type AddressLeases } from "@/lib/registry/onchain";
import { ONCHAIN_PAYMENT_DECLARATIONS } from "@/lib/registry/onchain-payments";
import {
  copyDeclarations,
  deriveSaleKeys,
  sumCopies,
  type CopyKeys,
  type DeclarationsCopy
} from "@/lib/registry/registry";
import { deriveRegistryKey, deriveRegistryReader, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

/*
 * At a change of the account's relays ("Settings", changeRelays), the registry's declarations of
 * the wallet's payments go to the new list: "Wallet" reads them on the account's list
 * (readDeclarations), to tell each payment's sale, its note and who took it ("By"), for good,
 * past the month the employees' records cover. Relays do not copy between themselves: what is not
 * copied stays on the list left. The wallet is the one list of the business's payments: the
 * declarations' addresses derive from their payment hashes (registryAddress), never listed.
 *
 * Each change is kept on the device until copied (src/lib/registry/moves.ts): a copy
 * interrupted (relays out of reach, the app or the account
 * closed, the wallet busy) is made again at the account's next opening (useTeamChannelsSync). And
 * once the transition is over (TRANSITION_SECONDS), the payments received since the change are
 * copied again: declarations still went to the list left meanwhile (an employee's device follows
 * within 5 minutes, then copies its own, member.ts; an integration's server reads its channel at
 * most every 5 minutes, and its invoice is paid up to an hour later, docs/integrations.md).
 *
 * The change is kept, too, until the account's other records it copies once saved are whole on
 * the new list (copyPendingRecords, moved-records.ts): copied
 * again at each opening of the account until then.
 *
 * The integrations' on-chain payments go too: their witnesses, which tell a
 * deposit's sale, and the leases they name (src/features/activity/onchain-sales.ts). Neither is
 * the registry's declaration of a payment hash: they are found by their integrations' authors and
 * their addresses, then copied as they are (only their integration and their orders sign them).
 * And the point of sale's on-chain payments: the declarations of the
 * deposits' transactions (src/lib/registry/onchain-payments.ts), copied as the declarations of the
 * payment hashes are.
 */

/** Payments read per page of the wallet's history (listWalletPaymentsPage, its local storage). */
export const PAYMENTS_PAGE_SIZE = 200;

/**
 * Longest wait for the wallet to be free (the activation, a wallet screen open, the employees'
 * lots), then for a sync that reached the network (Wallet.waitNetworkSync: never offline; the end
 * of its first sync is no proof, Wallet.getBalance): past it, nothing is copied (made again at the
 * next opening). Not measured on a device.
 */
export const DECLARATIONS_WALLET_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Longest invoice of an integration's server (docs/integrations.md, `duration`: 60 to 3600 s), whose
 * declaration may have gone to the list left: the server reads the channel at most every 5 minutes.
 */
const INTEGRATION_INVOICE_MAX_SECONDS = 3600;

/**
 * After a change, declarations of payments still to come may be on the list left: the longest
 * invoice of an integration's server declared before it followed (INTEGRATION_INVOICE_MAX_SECONDS),
 * with the margin the devices copy their own records with (MOVE_RECORDS_MARGIN_SECONDS, which
 * covers the server's 5 minutes, an employee's device that follows within 5 minutes and its
 * invoices' 10 minutes). The payments received since the change are copied again past it.
 */
export const TRANSITION_SECONDS = INTEGRATION_INVOICE_MAX_SECONDS + MOVE_RECORDS_MARGIN_SECONDS;

/**
 * A change whose copy never completed (a relay of the new list refusing for good) is given up
 * this long after it: each attempt reads the wallet's whole history.
 */
export const MOVE_GIVE_UP_SECONDS = 30 * 24 * 60 * 60;

/** setTimeout's longest delay (a signed 32-bit number of milliseconds). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** The connection was replaced by a wallet screen while the payments were read: read again. */
class ReplacedError extends Error {}

/**
 * A payment the wallet received: its hash, and when (Unix seconds, the SDK's); `completed` once
 * done, with the preimage the wallet released when the SDK gives it (the proof of the payment,
 * src/features/payment-link/OwnerLinksFinalizer.tsx).
 */
export type Received = { hash: string; at: number; completed: boolean; preimage: string | null };

/**
 * A deposit the wallet received (an on-chain payment): its transaction, and when (the SDK's). An
 * integration's order may have leased its address (src/features/activity/onchain-sales.ts).
 */
export type ReceivedDeposit = { txid: string; at: number };

/** What the wallet received: its Lightning payments, and its deposits. */
export type WalletReceipts = { payments: Received[]; deposits: ReceivedDeposit[] };

/**
 * Every payment the wallet received (Lightning: those with a hash), but failed ones, as
 * "Wallet" asks their declarations (useOwnerActivity): the whole history, page after page,
 * once a sync of the connection reached the network (else the latest payments may be missing, and
 * the end of the SDK's first sync proves no read of it, Wallet.getBalance): what it gives decides
 * for good (an invoice it lacks is "unpaid", owner-finals.ts; a change of relays copied, a month
 * archived). Newest first: a payment received meanwhile shifts the pages, which read one again,
 * never miss one.
 */
async function receivedPayments(own: () => boolean, deadline: number): Promise<WalletReceipts> {
  const received = new Map<string, Received>();
  const deposits = new Map<string, number>();
  try {
    if ((await within(waitWalletNetworkSync(), deadline - Date.now())) === null) {
      throw new Error("The wallet did not sync with the network in time");
    }
    for (let offset = 0; ; offset += PAYMENTS_PAGE_SIZE) {
      if (!own()) throw new ReplacedError();
      const page = await listWalletPaymentsPage({ offset, limit: PAYMENTS_PAGE_SIZE });
      for (const payment of page.payments) {
        const hash = payment.paymentHash?.toLowerCase();
        // 32 bytes in hex: anything else has no address in the registry (registryAddress).
        if (
          payment.direction === "receive" &&
          payment.status !== "failed" &&
          hash !== undefined &&
          /^[0-9a-f]{64}$/.test(hash)
        ) {
          // One payment per hash: a payment failed then sent again is listed twice.
          const known = received.get(hash);
          const completed = payment.status === "completed";
          received.set(hash, {
            hash,
            at: Math.min(known?.at ?? Infinity, payment.timestamp),
            completed: (known?.completed ?? false) || completed,
            preimage: known?.preimage ?? (completed ? (payment.preimage ?? null) : null)
          });
        }
        const txid = depositTxid(payment);
        if (txid !== null) {
          deposits.set(txid, Math.min(deposits.get(txid) ?? Infinity, payment.timestamp));
        }
      }
      if (page.listed < PAYMENTS_PAGE_SIZE) break;
    }
  } catch (error) {
    // Its calls fail once a wallet screen replaced the connection (notConnected).
    if (!own()) throw new ReplacedError();
    throw error;
  }
  return {
    payments: [...received.values()],
    deposits: [...deposits].map(([txid, at]) => ({ txid, at }))
  };
}

/**
 * The open account's payments received (receivedPayments), the wallet connected for that only
 * (withAccountWallet), then disconnected, never one a wallet screen holds: a screen that takes it
 * meanwhile is waited for, up to DECLARATIONS_WALLET_TIMEOUT_MS. Null when the account closed or
 * the build gave no connection; rejects when the wallet stayed busy or did not sync.
 */
export async function readWallet(): Promise<Received[] | null> {
  return (await readWalletReceipts())?.payments ?? null;
}

/** readWallet, with the wallet's deposits. */
export async function readWalletReceipts(): Promise<WalletReceipts | null> {
  const deadline = Date.now() + DECLARATIONS_WALLET_TIMEOUT_MS;
  for (;;) {
    try {
      return await withAccountWallet(deadline, (_, own) => receivedPayments(own, deadline));
    } catch (error) {
      if (!(error instanceof ReplacedError) || Date.now() >= deadline) throw error;
    }
  }
}

/**
 * The account's keys of the registry, unless it closed (its keys wiped) or another one opened.
 * Derived once (asked before each read, publication and authentication of a copy), and wiped as
 * soon as they are asked after the account closed, or with `wipe()` once the copy is through.
 */
function registryKeys(team: TeamKeys): (() => CopyKeys) & { wipe: () => void } {
  let keys: { key: Uint8Array; reader: NostrKeys } | null = null;
  const wipe = () => {
    keys?.key.fill(0);
    keys?.reader.secretKey.fill(0);
    keys = null;
  };
  const get = (): CopyKeys => {
    if (getAccountTeamKeys() !== team) {
      wipe();
      throw new Error("The account closed");
    }
    keys ??= { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) };
    return keys;
  };
  return Object.assign(get, { wipe });
}

/**
 * Runs `copy` from the witnesses' lookback (WITNESS_LOOKBACK_SECONDS) before the oldest of
 * `deposits` received at or after `since`, and before now: a payment the wallet has not claimed
 * yet (unconfirmed, the owner offline) is listed later, its witness made at most that long before.
 */
async function onchainSince(
  deposits: readonly ReceivedDeposit[],
  since: number,
  copy: (from: number) => Promise<boolean>
): Promise<boolean> {
  let oldest = nowUnix();
  for (const { at } of deposits) if (at >= since && at < oldest) oldest = at;
  return copy(oldest - WITNESS_LOOKBACK_SECONDS);
}

/** Whether two lists hold the same relays, whatever their order. */
function sameRelays(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((relay) => b.includes(relay));
}

/**
 * Copies the integrations' witnesses made since `since` on the list `from`, and the leases they
 * name, to the list `to`, each as it is: true once a majority of `to` holds each one, false when
 * `from` or the roster gave no majority's answer or `to` did not take one. Never rejects but when
 * the account closed.
 */
async function copyOnchainRecords(
  team: TeamKeys,
  keys: () => CopyKeys,
  since: number,
  from: readonly string[],
  to: readonly string[]
): Promise<boolean> {
  const roster = await readRoster(team, to);
  if (roster.status === "unread") return false;
  const holders = witnessHolders(team, roster.roster);
  if (holders.length === 0) return true;
  const network = invoiceNetwork();
  const read = await fetchWitnesses(holders, network, since, {
    relays: from,
    channel: "account",
    timeoutMs: TEAM_TIMEOUT_MS.background
  });
  if (read === null) return false;
  const sold = read.witnesses.filter(({ sale }) => sale !== null);
  const { key, reader } = keys();
  if (!reader) return false;
  const leases: Map<string, AddressLeases> | null =
    sold.length === 0
      ? new Map()
      : await ownerLeasesOf(
          { key, reader },
          [...new Set(sold.map(({ address }) => address))],
          network,
          { relays: from }
        );
  if (leases === null) return false;
  const seenKey = new Map(holders.map(({ id, keys: of }) => [id, of.seen.nostr.secretKey]));
  // Each witness, signed by its integration's seen key (the account's channel); each lease a
  // witness names, by its sale, on the anonymous channel as every registry record (relay.ts: a
  // connection's authentications tie its keys together).
  const copies: { event: NostrEvent; channel: RelayChannel; authKey: () => Uint8Array }[] = [
    ...read.witnesses.map(({ event, integration }) => ({
      event,
      channel: "account" as const,
      authKey: () => seenKey.get(integration)!
    })),
    ...sold.flatMap(({ address, sale }) =>
      (leases.get(address)?.leases ?? [])
        .filter((lease) => lease.author === sale)
        .map((lease) => ({
          event: lease.event,
          channel: "anonymous" as const,
          authKey: () => {
            // Refused once the account closed.
            keys();
            return deriveSaleKeys(lease.saleKey).nostr.secretKey;
          }
        }))
    )
  ];
  const unique = [...new Map(copies.map((copy) => [copy.event.id, copy])).values()];
  let held = true;
  for (let next = 0; next < unique.length; next += COPIES_AT_ONCE) {
    keys();
    const took = await Promise.all(
      unique
        .slice(next, next + COPIES_AT_ONCE)
        .map(({ event, channel, authKey }) =>
          publishAgain(
            event,
            { relays: to, timeoutMs: TEAM_TIMEOUT_MS.background, channel, authKey },
            { quorum: "majority" }
          )
        )
    );
    if (took.some((relays) => relays.length < majority(to.length))) held = false;
  }
  return held;
}

/** Whether a copy found every declaration it looked for and left each on a majority of `to`. */
function complete(copy: DeclarationsCopy): boolean {
  return copy.unread === 0 && copy.held === copy.found;
}

/**
 * The copies and the record's writes, one after the other: a later change copies after. The owner's
 * copy of the declarations (src/features/activity/archive.ts) reads the wallet in the same queue.
 */
let queue: Promise<unknown> = Promise.resolve();

export function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** Resolves once the copies started so far are through (a later change, tests). */
export function declarationsCopied(): Promise<void> {
  return queue.then(() => undefined);
}

/**
 * Copies the declarations of every payment the wallet received from the list `before` to `next`
 * (copyDeclarations), in the background, after the copies under way. Resolves with what it copied;
 * null when nothing was (the same relays, the account closed, the wallet busy or offline). Stops
 * once the account closes: nothing more is published. Never rejects.
 */
export function copyAccountDeclarations(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<DeclarationsCopy | null> {
  return queued(() => copyNow(team, before, next));
}

/** copyAccountDeclarations, outside the queue (from a task of it). */
async function copyNow(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<DeclarationsCopy | null> {
  if (sameRelays(before, next)) return null;
  const keys = registryKeys(team);
  try {
    keys();
    const receipts = await readWalletReceipts();
    if (receipts === null) return null;
    const copy = await copyDeclarations(
      keys,
      receipts.payments.map(({ hash }) => hash),
      invoiceNetwork(),
      before,
      next
    );
    const deposits = await copyDeclarations(
      keys,
      receipts.deposits.map(({ txid }) => txid),
      invoiceNetwork(),
      before,
      next,
      undefined,
      ONCHAIN_PAYMENT_DECLARATIONS
    );
    await onchainSince(receipts.deposits, -Infinity, (since) =>
      copyOnchainRecords(team, keys, since, before, next)
    );
    return sumCopies(copy, deposits);
  } catch (error) {
    logFailure("Copying the registry's declarations failed", error);
    return null;
  } finally {
    keys.wipe();
  }
}

/**
 * Keeps the change of account `walletId`'s relays saved at `at` (the settings' `updatedAt`), which
 * left `left`, then copies its declarations (copyPendingDeclarations) while that account is open,
 * at its next opening otherwise (the account closed or another one opened during the change: it
 * is still that account's, never the one open now). Never rejects.
 */
export function noteRelaysMove(
  walletId: string | null,
  left: readonly string[],
  at: number
): Promise<void> {
  if (!walletId) return Promise.resolve();
  void queued(async () => {
    try {
      const record = await loadRegistryMoves(walletId);
      if (!record.moves.some((move) => move.at === at && sameRelays(move.left, left))) {
        // The oldest go first: their declarations reached the lists after them, or are lost.
        record.moves = [
          ...record.moves,
          { left: [...left], at, copied: null, records: false }
        ].slice(-MAX_MOVES);
      }
      await saveRegistryMoves(walletId, record);
    } catch (error) {
      // A newer app's record (never written over), or the storage failing: copied now only.
      logFailure("Keeping the change of relays failed", error);
      const team = getAccountTeamKeys();
      const relays = getAccountSettings()?.relays;
      if (team && relays && getAccountWalletId() === walletId) await copyNow(team, left, relays);
    }
  });
  return copyPendingDeclarations();
}

/** The timer of the next copy of a transition, while the account stays open. */
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Copies what the open account's record says is still to copy (noteRelaysMove), to the account's
 * list as it is now: from each list left, every payment received if its copy never completed, else
 * those received since its change once its transition is over (TRANSITION_SECONDS). A change is
 * forgotten once a complete copy started past its transition, or MOVE_GIVE_UP_SECONDS after it.
 * Then waits for the next transition's end while the account stays open (at the next opening
 * otherwise). At a change, at each opening of the account. Never rejects.
 */
export function copyPendingDeclarations(): Promise<void> {
  return queued(async () => {
    const walletId = getAccountWalletId();
    const team = getAccountTeamKeys();
    if (!walletId || !team) return;
    try {
      const record = await loadRegistryMoves(walletId);
      const now = nowUnix();
      let moves = record.moves.filter(({ at }) => now < at + MOVE_GIVE_UP_SECONDS);
      const back = (move: RelaysMove, next: readonly string[] | undefined) => {
        if (!next || !sameRelays(move.left, next)) return false;
        // Back on the list it left: its declarations are there, and its other records.
        move.copied = Math.max(nowUnix(), move.at + TRANSITION_SECONDS);
        move.records = true;
        return true;
      };
      const due: RelaysMove[] = [];
      for (const move of moves) {
        const { at, copied } = move;
        const pending =
          copied === null || (copied < at + TRANSITION_SECONDS && now >= at + TRANSITION_SECONDS);
        // One back on the list it left is settled without reading the wallet.
        if (pending && !back(move, getAccountSettings()?.relays)) due.push(move);
      }
      if (due.length > 0) {
        // Received by then: what the copies below cover.
        const startedAt = nowUnix();
        const receipts = await readWalletReceipts();
        if (receipts === null) return;
        const received = receipts.payments;
        const keys = registryKeys(team);
        try {
          for (const move of due) {
            const next = getAccountSettings()?.relays;
            // The account closed meanwhile: what was copied is kept, the rest at its next opening.
            if (!next || getAccountTeamKeys() !== team) break;
            // The list changed back while the wallet was read.
            if (back(move, next)) continue;
            const since = move.copied === null ? -Infinity : move.at - MOVE_RECORDS_MARGIN_SECONDS;
            const copy = await copyDeclarations(
              keys,
              received.filter(({ at }) => at >= since).map(({ hash }) => hash),
              invoiceNetwork(),
              move.left,
              next
            ).catch(() => null);
            if (copy === null) break;
            const deposits = await copyDeclarations(
              keys,
              receipts.deposits.filter(({ at }) => at >= since).map(({ txid }) => txid),
              invoiceNetwork(),
              move.left,
              next,
              undefined,
              ONCHAIN_PAYMENT_DECLARATIONS
            ).catch(() => null);
            if (deposits === null) break;
            const onchain = await onchainSince(receipts.deposits, since, (from) =>
              copyOnchainRecords(team, keys, from, move.left, next)
            ).catch(() => false);
            if (complete(copy) && complete(deposits) && onchain) move.copied = startedAt;
          }
        } finally {
          keys.wipe();
        }
      }
      moves = moves.filter(
        ({ at, copied, records }) => copied === null || copied < at + TRANSITION_SECONDS || !records
      );
      // The account's own record, whichever is open now.
      await saveRegistryMoves(walletId, { ...record, moves });
      if (getAccountWalletId() !== walletId) return;
      scheduleTransition(moves);
    } catch (error) {
      // The account closed, the wallet busy or offline, a newer app's record: at the next opening.
      logFailure("Copying the registry's declarations failed", error);
    }
  });
}

/**
 * Copies again the account's records each change kept on this device left to copy (records false:
 * its copies once saved were cut short, or never ran, src/lib/registry/moves.ts), from the relays of
 * the list it left that sattle.me did not retire to the account's list as it is now
 * (copyMovedRecords); a change back on the list it left has nothing to copy. A change whose copy is
 * whole is no longer copied; one MOVE_GIVE_UP_SECONDS old is forgotten (copyPendingDeclarations).
 * At each opening of the account, before its declarations. Never rejects.
 */
export function copyPendingRecords(): Promise<void> {
  return queued(async () => {
    const walletId = getAccountWalletId();
    const team = getAccountTeamKeys();
    if (!walletId || !team) return;
    try {
      const record = await loadRegistryMoves(walletId);
      const now = nowUnix();
      const due = record.moves.filter(
        ({ at, records }) => !records && now < at + MOVE_GIVE_UP_SECONDS
      );
      for (const move of due) {
        const settings = getAccountSettings();
        // The account closed meanwhile: at its next opening.
        if (!settings || getAccountTeamKeys() !== team) break;
        if (sameRelays(move.left, settings.relays)) {
          move.records = true;
          continue;
        }
        move.records = await copyMovedRecords(team, settings, liveRelays(move.left));
        // The change and its copies are the account's own record, whichever is open now.
        await saveRegistryMoves(walletId, record);
      }
      await saveRegistryMoves(walletId, record);
    } catch (error) {
      // The account closed, a newer app's record: at the next opening.
      logFailure("Copying the records of a change of relays again failed", error);
    }
  });
}

function stopTransitionTimer(): void {
  if (transitionTimer !== null) clearTimeout(transitionTimer);
  transitionTimer = null;
}

/** Whether the timer is stopped when the account closes (its next opening copies instead). */
let watchingAccount = false;

/** Copies again at the end of the next transition among `moves`, while the account stays open. */
function scheduleTransition(moves: readonly RelaysMove[]): void {
  stopTransitionTimer();
  if (!watchingAccount) {
    watchingAccount = true;
    subscribeAccount(() => {
      if (getAccountWalletId() === null) stopTransitionTimer();
    });
  }
  // Transitions still to end only: one over whose copy did not complete waits for the next opening
  // (copied again at once, it would only fail again).
  const now = nowUnix();
  const ends = moves
    .filter(({ at, copied }) => copied !== null && copied < at + TRANSITION_SECONDS)
    .map(({ at }) => at + TRANSITION_SECONDS)
    .filter((end) => end > now);
  if (ends.length === 0) return;
  const delay = Math.min((Math.min(...ends) - nowUnix()) * 1000 + 1000, MAX_TIMEOUT_MS);
  transitionTimer = setTimeout(
    () => {
      transitionTimer = null;
      void copyPendingDeclarations();
    },
    Math.max(0, delay)
  );
}
