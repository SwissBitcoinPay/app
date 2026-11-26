import { MAX_RECOVERY_FEE_SATS_PER_LEAF } from "@/config/onchain";
import { majority } from "@/config/registry";
import { getBreezNetwork } from "@/lib/breez/config";
import { WalletError } from "@/lib/breez/errors";
import type { RecoveryBuild, RecoveryQuote, RecoveryWallet } from "@/lib/breez/types";
import { logFailure } from "@/lib/log/log";
import {
  COPIES_AT_ONCE,
  publishAgain,
  publishToQuorum,
  queryRelays,
  type RelayCall
} from "@/lib/nostr/pool";
import { deviceChainSources, readChain } from "@/features/onchain/explorer";
import { broadcastPackage, broadcastTransaction } from "@/lib/onchain/broadcast";
import {
  addsTo,
  fundsRecoveriesAuthorFilter,
  fundsRecoveriesEvent,
  fundsRecoveriesOf,
  fundsRecoveryFilter,
  heldFundsRecoveries,
  mergeFundsRecoveries,
  type FundsRecoveries,
  type RecordedRecovery,
  type RecoverySubject
} from "@/lib/recovery/record";
import {
  deriveFundsRecoveryKeys,
  wipeFundsRecoveryKeys,
  type FundsRecoveryKeys,
  type TeamKeys
} from "@/lib/team/keys";

/*
 * The recovery of a wallet's funds that left its balance, automatic and unseen (never shown as
 * such, they come back to the balance). Funds leave it when the Spark operators' watchtower defends
 * them on-chain, or a leaf's exit starts there (spark-sdk 0.28.4, `recoverableFundsSats`): only an
 * on-chain transaction to an address of the wallet brings them back. Here, to a deposit address of
 * the same wallet reserved for it (src/lib/recovery/record.ts), whose deposit the SDK then claims
 * as any other (MAX_DEPOSIT_CLAIM_FEE_SATS).
 *
 * At each attempt (funds-recovery-sync.ts says when), with the wallet connected:
 * 1. what is to recover, once the SDK's first sync is done (it reckons it at each sync);
 * 2. the wallet's record, from a majority of the relays (a decision that must not be missed: the
 *    reserved address); a newer app's copy is never written over;
 * 3. the reserved address, chosen once (a new deposit address of the wallet, published to a
 *    majority before any use: every device and attempt sends to the same one);
 * 4. a quote at the network's rate for the hour, of every leaf worth recovering at it. A step that
 *    needs Bitcoin from outside the wallet (a CPFP child) cannot be paid: the cooperative leaves
 *    are quoted on their own then, and each unilateral leaf alone, those that need it left out
 *    (told to the journal: the support sees what stays out of the balance);
 * 5. what the rate adds to the least any recovery of these leaves pays (the same quote at 0 sat/vB,
 *    which keeps the fees already taken on-chain), within MAX_RECOVERY_FEE_SATS_PER_LEAF per leaf;
 *    above it, it waits for a lower rate;
 * 6. the recovery built and signed by the SDK (the operators co-sign the cooperative ones), its
 *    transactions that bring the funds back written to the record before any is sent (they are then
 *    "Funds recovered" on every device), then each step ready sent through mempool.space (or the
 *    merchant's node), the steps after a timelock or a confirmation at a later attempt. A step with
 *    a child (the refund of a leaf received with the fee ladder, whose child pays its fee out of
 *    the leaf) goes with it, as a package: the step alone pays no fee, nodes refuse it. Sending one
 *    again is harmless (spark-sdk 0.28.4: "you never have to remember what you broadcast").
 * Mainnet only: the transactions go through mempool.space's mainnet.
 */

/** Per relay, connection included. */
export const FUNDS_RECOVERY_RELAY_TIMEOUT_MS = 10_000;

export type FundsRecoveryOutcome =
  /** Nothing left the balance (or nothing worth recovering at the network's rate). */
  | { status: "none" }
  /**
   * Not now: the relays did not answer (a majority), a newer app's record, the wallet disconnected
   * meanwhile, a network out of the app's reach. Tried again at the next attempt.
   */
  | { status: "later" }
  /**
   * Done for now: `sent` steps broadcast (or already held by the network), `waiting` when steps
   * remain for a later attempt (a timelock, a confirmation, a lower rate), `stranded` leaves that
   * need Bitcoin from outside the wallet.
   */
  | { status: "done"; sent: number; waiting: boolean; stranded: number };

export type FundsRecoveryParams = {
  wallet: RecoveryWallet;
  /** The wallet's id (its identity key): the account's, or the card's wallet's. */
  walletId: string;
  subject: RecoverySubject;
  team: TeamKeys;
  relays: readonly string[];
  /** Whether the wallet's connection is still the one the attempt started on. */
  own: () => boolean;
  /** Unix seconds. */
  now?: () => number;
};

/** The ids of a quote's leaves, in its order. */
function leafIdsOf(quote: { leaves: readonly { leafId: string }[] }): string[] {
  return quote.leaves.map(({ leafId }) => leafId);
}

function sameLeaves(a: RecoveryQuote, b: RecoveryQuote): boolean {
  const ids = new Set(leafIdsOf(a));
  return a.leaves.length === b.leaves.length && b.leaves.every(({ leafId }) => ids.has(leafId));
}

/**
 * The transactions of `build` that bring funds to the reserved address, each with the value of the
 * leaves it recovers: a cooperative recovery, its leaf's; the sweep, the unilateral leaves'.
 */
function returningOf(build: RecoveryBuild, at: number): RecordedRecovery[] {
  const values = new Map(build.leaves.map(({ leafId, valueSats }) => [leafId, valueSats]));
  const unilateral = build.leaves
    .filter(({ method }) => method === "unilateral")
    .reduce((sum, { valueSats }) => sum + valueSats, 0n);
  return build.transactions.flatMap((tx): RecordedRecovery[] => {
    if (tx.kind === "cooperative" && tx.leafId !== null) {
      const valueSats = values.get(tx.leafId);
      return valueSats ? [{ txid: tx.txid, valueSats, at }] : [];
    }
    return tx.kind === "sweep" && unilateral > 0n
      ? [{ txid: tx.txid, valueSats: unilateral, at }]
      : [];
  });
}

/** A step to send now: ready, or not verified (refused if it cannot go). */
function sendable(tx: RecoveryBuild["transactions"][number]): boolean {
  return tx.status === "ready" || tx.status === "unverified";
}

/** Thrown to end an attempt for later: nothing to tell the journal. */
class Later extends Error {
  constructor() {
    super("Later");
    this.name = "Later";
  }
}

/**
 * One attempt at recovering `params.wallet`'s funds that left its balance (see above). Never
 * rejects: a failure goes to the journal, and is tried again at the next attempt.
 */
export async function recoverFunds(params: FundsRecoveryParams): Promise<FundsRecoveryOutcome> {
  const { wallet, walletId, subject, team, relays, own } = params;
  const now = params.now ?? (() => Math.floor(Date.now() / 1000));
  let keys: FundsRecoveryKeys | null = null;
  try {
    const network = getBreezNetwork();
    if (network !== "mainnet") return { status: "later" };
    if ((await wallet.getRecoverableFunds(true)) === 0n) return { status: "none" };
    if (!own()) return { status: "later" };

    const recordKeys = deriveFundsRecoveryKeys(team);
    keys = recordKeys;
    const call: RelayCall = {
      relays,
      channel: "account",
      timeoutMs: FUNDS_RECOVERY_RELAY_TIMEOUT_MS,
      authKey: recordKeys.nostr.secretKey
    };
    const quorum = majority(relays.length);
    const answers = await queryRelays(fundsRecoveryFilter(recordKeys, subject), call, {
      quorum: "majority"
    });
    if (answers.size < quorum) return { status: "later" };
    const read = fundsRecoveriesOf(recordKeys, subject, network, answers, walletId);
    if (read.newer) {
      logFailure("A newer app's funds recovery record: left as it is");
      return { status: "later" };
    }
    let held: FundsRecoveries = read.recoveries ?? {
      subject,
      walletId: walletId.toLowerCase(),
      destination: null,
      recoveries: []
    };
    let newestAt = read.newestAt;
    /** Publishes `next` to a majority, dated after every copy seen; Later when it cannot. */
    const publish = async (next: FundsRecoveries) => {
      const createdAt = Math.max(now(), (newestAt ?? -1) + 1);
      try {
        await publishToQuorum(fundsRecoveriesEvent(recordKeys, next, createdAt), call, quorum);
      } catch {
        throw new Later();
      }
      newestAt = createdAt;
      held = next;
    };

    if (!held.destination) {
      const address = await wallet.newDepositAddress(walletId);
      await publish(
        mergeFundsRecoveries(held, { ...held, destination: { address, at: now() }, recoveries: [] })
      );
    }
    const destination = held.destination!.address;
    if (!own()) return { status: "later" };

    const rate = await wallet.getHourFeeRate();
    const quote = await wallet.prepareRecovery(destination, rate, null);
    if (quote.leaves.length === 0) return { status: "none" };
    const quotes: RecoveryQuote[] = [];
    let stranded = 0;
    if (!quote.needsFunding) quotes.push(quote);
    else {
      const cooperative = quote.leaves.filter(({ method }) => method === "cooperative");
      if (cooperative.length > 0) {
        const alone = await wallet.prepareRecovery(
          destination,
          rate,
          leafIdsOf({ leaves: cooperative })
        );
        if (!alone.needsFunding && alone.leaves.length > 0) quotes.push(alone);
      }
      for (const { leafId, method } of quote.leaves) {
        if (method !== "unilateral") continue;
        const alone = await wallet.prepareRecovery(destination, rate, [leafId]);
        if (alone.needsFunding) stranded += 1;
        else if (alone.leaves.length > 0) quotes.push(alone);
      }
      if (stranded > 0) {
        logFailure("Funds left the balance that only Bitcoin from outside the wallet recovers");
      }
    }

    let sent = 0;
    let waiting = false;
    for (const group of quotes) {
      if (!own()) return { status: "later" };
      const least = await wallet.prepareRecovery(destination, 0n, leafIdsOf(group));
      const added = group.totalFeeSats - least.totalFeeSats;
      if (least.needsFunding || !sameLeaves(least, group) || added < 0n) {
        // The two quotes disagree (the chain moved between them): the next attempt quotes again.
        waiting = true;
        continue;
      }
      if (added > MAX_RECOVERY_FEE_SATS_PER_LEAF * BigInt(group.leaves.length)) {
        waiting = true;
        continue;
      }
      const build = await wallet.buildRecovery(group);
      if (build.failedLeafIds.length > 0) waiting = true;
      const returning = returningOf(build, now());
      const next = mergeFundsRecoveries(held, { ...held, recoveries: returning });
      if (addsTo(next, held)) await publish(next);
      for (const tx of build.transactions) {
        if (tx.status !== "confirmed" && !sendable(tx)) waiting = true;
        if (!sendable(tx)) continue;
        try {
          // Through the device's explorer: the merchant's own node when the account names one.
          const { hex, txid, childHex } = tx;
          const outcome = await readChain(await deviceChainSources(), (api) =>
            childHex === null
              ? broadcastTransaction(hex, txid, {}, api)
              : broadcastPackage(hex, txid, childHex, {}, api)
          );
          if (outcome === "refused") waiting = true;
          else sent += 1;
        } catch (error) {
          // The explorer unreachable: the next attempt sends it.
          logFailure("Sending a recovery's transaction failed", error);
          waiting = true;
        }
      }
    }
    return { status: "done", sent, waiting, stranded };
  } catch (error) {
    if (error instanceof Later) return { status: "later" };
    if (error instanceof WalletError && error.code === "notConnected") return { status: "later" };
    logFailure("Recovering a wallet's funds failed", error);
    return { status: "later" };
  } finally {
    if (keys) wipeFundsRecoveryKeys(keys);
  }
}

/**
 * Copies the newest copy of each of the account's wallets' records the relays `before` hold (of a
 * newer format too, as it is) to the relays of `next` that lack it, after a change of the account's
 * relays (moveTeam): the next attempt reads it there, with its reserved address and the
 * transactions "Funds recovered" names. In the background, the change never waits for it: a record
 * lost only makes the next attempt reserve another deposit address of the same wallet, and shows
 * its past recoveries as on-chain deposits. Never rejects.
 */
export async function copyFundsRecoveries(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<void> {
  let keys: FundsRecoveryKeys | null = null;
  try {
    const recordKeys = deriveFundsRecoveryKeys(team);
    keys = recordKeys;
    const call = (relays: readonly string[]): RelayCall => ({
      relays,
      channel: "account",
      timeoutMs: FUNDS_RECOVERY_RELAY_TIMEOUT_MS,
      authKey: recordKeys.nostr.secretKey
    });
    const answers = await queryRelays(fundsRecoveriesAuthorFilter(recordKeys), call(before), {
      quorum: "majority"
    });
    if (answers.size < majority(before.length)) {
      logFailure("Copying the funds recovery records: too few relays answered");
      return;
    }
    // Each record until a majority of `next` holds it (those of both lists holding it count), the
    // others in the background: the address reserved is read there from a majority.
    const quorum = majority(next.length);
    const copies = [...heldFundsRecoveries(recordKeys, answers).values()].flatMap(
      ({ event, holders }) => {
        const holding = next.filter((relay) => holders.includes(relay)).length;
        const missing = next.filter((relay) => !holders.includes(relay));
        return missing.length > 0 ? [{ event, missing, need: quorum - holding }] : [];
      }
    );
    for (let start = 0; start < copies.length; start += COPIES_AT_ONCE) {
      await Promise.all(
        copies
          .slice(start, start + COPIES_AT_ONCE)
          .map(({ event, missing, need }) =>
            publishAgain(event, call(missing), { quorum: { count: need } })
          )
      );
    }
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying the funds recovery records to the new relays failed", error);
  } finally {
    if (keys) wipeFundsRecoveryKeys(keys);
  }
}

/**
 * The transactions that brought funds back to the wallet `walletId` (`subject`'s), as its record on
 * `relays` names them (any copy a relay holds: only the account writes it), each with the value of
 * the leaves it recovered: "Wallet" and "Cards" show their deposit as "Funds recovered", never a
 * sale nor a reception. Read until a majority answered (the record is published to one); null when
 * fewer did (a recovery unread would be told a reception), or a newer app's copy may name more.
 * Never rejects but when the account closed (its team keys wiped).
 */
export async function readRecoveredTransactions(
  team: TeamKeys,
  walletId: string,
  subject: RecoverySubject,
  relays: readonly string[]
): Promise<ReadonlyMap<string, bigint> | null> {
  const keys = deriveFundsRecoveryKeys(team);
  try {
    const answers = await queryRelays(
      fundsRecoveryFilter(keys, subject),
      {
        relays,
        channel: "account",
        timeoutMs: FUNDS_RECOVERY_RELAY_TIMEOUT_MS,
        authKey: keys.nostr.secretKey
      },
      { quorum: "majority" }
    );
    if (answers.size < majority(relays.length)) return null;
    const read = fundsRecoveriesOf(keys, subject, getBreezNetwork(), answers, walletId);
    if (read.newer) return null;
    return new Map(
      (read.recoveries?.recoveries ?? []).map(({ txid, valueSats }) => [txid, valueSats])
    );
  } finally {
    wipeFundsRecoveryKeys(keys);
  }
}
