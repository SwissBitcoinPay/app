import { majority } from "@/config/registry";
import { ownerEpochSettled } from "@/features/team/export-epochs";
import {
  getAccountSettings,
  getAccountTeamKeys,
  subscribeAccount
} from "@/features/account/session";
import { inBatches } from "@/lib/batches";
import type { WalletPayment } from "@/lib/breez/types";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, copyEveryEvent, publishAgain, type RelayCall } from "@/lib/nostr/pool";
import { deriveWalletSendKeys, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { sameRelayList } from "@/lib/relays/list";
import {
  fetchWalletSends,
  walletSendAddress,
  walletSendEvent,
  walletSendOf,
  walletSendsFilter,
  type WalletSend
} from "@/lib/wallet-sends/record";

import { readWalletPayments } from "./payments-history";

/*
 * Each payment the account's wallet sent, published once it is done
 * (src/lib/wallet-sends/record.ts: the owner's app publishes its sendings and withdrawals as soon
 * as it makes them, for the assistants' export). "Wallet" publishes them while it shows the wallet
 * (useWalletSends), as it records the payments' rates (payment-rates.ts): every sending done that
 * is not published, once its list is read after the wallet's sync and at each payment done since;
 * the first round of an opening of the account goes through the wallet's whole history (its
 * storage, page by page), so that the sendings of before are published once.
 *
 * A record is written only after a whole read of the sendings' span from a majority of the relays
 * told it was not there (another of the owner's devices may have written it); one that fewer than a
 * majority hold is published again as it is. Never written over a record of a newer format. "Delete
 * account" stops the rounds first (holdWalletSends): a record written after its deletion requests
 * would outlive them.
 */

type Known = {
  team: TeamKeys;
  /** The payments whose record a majority of the relays holds, read or written since the account opened. */
  published: Set<string>;
  /** The addresses of records a newer app wrote: never written over. */
  newer: Set<string>;
  held: boolean;
  running: Promise<SendsOutcome> | null;
  /** A round asked while one ran: it runs next, with these payments. */
  again: readonly WalletPayment[] | null;
  /** A round went through the wallet's whole history: later ones through the payments shown. */
  whole: boolean;
};

/** How a round ended: every sending published (or none to publish), or some left for a later one. */
export type SendsOutcome = "done" | "left";

let known: Known | null = null;

// The account closed (or another one opened): what this device knew goes with it.
subscribeAccount(() => {
  if (known && getAccountTeamKeys() !== known.team) known = null;
});

function knownOf(team: TeamKeys): Known {
  if (known?.team !== team) {
    known = {
      team,
      published: new Set(),
      newer: new Set(),
      held: false,
      running: null,
      again: null,
      whole: false
    };
  }
  return known;
}

function openAccount(): { team: TeamKeys; relays: readonly string[] } | null {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  return team && settings && settings.signUp === "done" ? { team, relays: settings.relays } : null;
}

/** A call to `relays` as the sendings' author: a relay gives and takes its events from it only. */
function sendsCall(team: TeamKeys, relays: readonly string[]): RelayCall {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account",
    authKey: () => deriveWalletSendKeys(team).nostr.secretKey
  };
}

/** The sendings of `payments` to publish: done, not known published, not of a newer record, each once. */
export function sendsToPublish(
  state: Pick<Known, "published" | "newer">,
  team: TeamKeys,
  payments: readonly WalletPayment[]
): WalletSend[] {
  const keys = deriveWalletSendKeys(team);
  const due = new Map<string, WalletSend>();
  for (const payment of payments) {
    const send = walletSendOf(payment);
    if (!send || state.published.has(send.payment)) continue;
    if (state.newer.size > 0 && state.newer.has(walletSendAddress(keys, send.payment))) continue;
    due.set(send.payment, send);
  }
  return [...due.values()].sort((a, b) => a.at - b.at);
}

async function round(state: Known, shown: readonly WalletPayment[]): Promise<SendsOutcome> {
  const open = openAccount();
  if (!open || open.team !== state.team || state.held) return "left";
  const { team, relays } = open;
  // The whole history once (the sendings of before), then the payments shown.
  const payments = state.whole ? shown : await readWalletPayments(0);
  const wanted = sendsToPublish(state, team, payments);
  if (wanted.length === 0) {
    state.whole = true;
    return "done";
  }
  // The account's export epoch first (export-epochs.ts): what a withdrawn grant read never opens it.
  await ownerEpochSettled();
  const keys = deriveWalletSendKeys(team);
  const call = sendsCall(team, relays);
  const quorum = majority(relays.length);
  const read = await fetchWalletSends(keys, call, wanted[0]!.at, wanted[wanted.length - 1]!.at);
  for (const address of read.newer) state.newer.add(address);
  if (read.answered < quorum) return "left";
  const writes: { payment: string; event: NostrEvent }[] = [];
  for (const send of wanted) {
    // Its address holds a record of a newer format, found by this read: left as it is.
    if (state.newer.has(walletSendAddress(keys, send.payment))) continue;
    const event = read.events.get(send.payment);
    if (event && (read.copies.get(send.payment) ?? 0) >= quorum) state.published.add(send.payment);
    // Held by too few relays (a write that half failed): the same record, again; else a new one.
    else writes.push({ payment: send.payment, event: event ?? walletSendEvent(keys, send) });
  }
  const took = await inBatches(writes, COPIES_AT_ONCE, async (write) => {
    if (state.held) return null;
    const held = await publishAgain(write.event, call, { quorum: "majority" });
    if (held.length < quorum) return false;
    state.published.add(write.payment);
    return true;
  });
  const done = took !== null && took.every(Boolean);
  if (done) state.whole = true;
  return done ? "done" : "left";
}

/**
 * Publishes every sending of the open account's wallet (connected) not published, as above. One
 * round at a time: asked while one runs, another follows it. Resolves with "left" when one could not
 * be published (no majority's answer, the wallet closed): a later round tries again. Never rejects.
 */
export function recordWalletSends(shown: readonly WalletPayment[]): Promise<SendsOutcome> {
  const open = openAccount();
  if (!open) return Promise.resolve("left");
  const state = knownOf(open.team);
  if (state.held) return Promise.resolve("left");
  if (state.running) {
    state.again = shown;
    return state.running;
  }
  const running = (async (): Promise<SendsOutcome> => {
    let outcome = await round(state, shown).catch((error: unknown) => {
      logFailure("Publishing the wallet's sendings failed", error);
      return "left" as const;
    });
    while (state.again !== null && known === state && !state.held) {
      const next = state.again;
      state.again = null;
      outcome = await round(state, next).catch(() => "left" as const);
    }
    return outcome;
  })().finally(() => {
    state.running = null;
  });
  state.running = running;
  return running;
}

/**
 * Stops the rounds of the open account ("Delete account", account-deletion.ts): once the round
 * running ended, nothing is written any more. Returns the function that lets them run again (the
 * deletion failed). Never rejects.
 */
export async function holdWalletSends(): Promise<() => void> {
  const open = openAccount();
  if (!open) return () => {};
  const state = knownOf(open.team);
  if (state.held) return () => {};
  state.held = true;
  await state.running;
  return () => {
    if (known === state) state.held = false;
  };
}

/**
 * Copies the sendings to the relays `next` after a change of the account's relays ("Settings",
 * changeRelays), each record as it is (copyEveryEvent): the assistants read them there afterwards.
 * Resolves with whether a majority of `next` holds every record. Never rejects.
 */
export async function copyWalletSends(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  try {
    // To a majority of the new list, each sending: the assistants read them there from a majority.
    const copied = await copyEveryEvent(
      walletSendsFilter(deriveWalletSendKeys(team), 0),
      sendsCall(team, before),
      next
    );
    if (!copied)
      logFailure("Copying the wallet's sendings: not every record reached the new relays");
    return copied;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): copied again at its next opening.
    logFailure("Copying the wallet's sendings to the new relays failed", error);
    return false;
  }
}
