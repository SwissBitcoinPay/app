import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { hasMainWallet } from "@/features/account/main-wallet";
import { WALLET_REFRESH_MS } from "@/features/wallet/useWalletData";
import type { WalletPayment } from "@/lib/breez/types";
import { noteCardHeld } from "@/features/recovery-check/holdings";
import { logFailure } from "@/lib/log/log";

import {
  holdAccountWallet,
  leaseCardWallet,
  readCardWallet,
  type CardWalletLease,
  type CardWalletOf,
  type CardWalletView
} from "./card-wallet";
import { withCardAccess } from "./states";

/*
 * The card's own wallet in "Cards", connected while what shows it is mounted (card-wallet.ts): its
 * balance under the card (CardsScreen.tsx), and in the card's panel "Top up" and "Withdraw to my
 * main balance" (CardWalletFlow.tsx). The same on the phone and on the web app:
 * nothing here needs the card in hand.
 */

/** A card's wallet as its screens show it: being read, unread, or read (useCardWallet). */
export type CardWalletLoaded =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; lease: CardWalletLease; view: CardWalletView };

type Loaded = CardWalletLoaded;

/**
 * How often a card's balance under it is read again while its SDK could not be listened to (it
 * refused): as "Wallet"'s (useWalletData). Listened to, it is read on its events only (no reading
 * again on a timer besides).
 */
const UNHEARD_READ_MS = WALLET_REFRESH_MS;

/** The newest payments of a card's wallet looked through at each read, for those it received. */
const RECEIPTS_PAGE_SIZE = 50;

/** Whether `payment` was received, and credited. */
function isReceipt(payment: WalletPayment): boolean {
  return payment.direction === "receive" && payment.status === "completed";
}

/** A card's wallet held for a hook (holdCardWallet): read again, or let go. */
type WalletHold = {
  /** Reads it again, synced first (after a recharge); null, doing nothing, until it is leased. */
  refresh(): Promise<void> | null;
  /** Lets it go: nothing it reads shows any more. */
  stop(): void;
};

/**
 * Leases the wallet of `card` (the open account's keys) and reads it, each read given to `show`;
 * `follow`: read again from the SDK's storage, which syncs on its own while connected (what a tap
 * paid, a payer sent), as soon as the SDK says something moved (its events); every UNHEARD_READ_MS
 * instead when it could not be listened to. Those reads one at
 * a time, one more if asked meanwhile. Its reads are numbered as their balances came: a read never
 * replaces a later one's. Once stopped, nothing more is shown, it listens no more and the lease
 * goes, at once if it came meanwhile.
 *
 * `received` (a notice for each deposit): the payments it received since it
 * was held, each told once: as its SDK tells it (its event's payment, before its balance is read),
 * else as a read finds it. Those it had when first read (synced) are not: they came while nothing
 * watched it, its balance says them.
 */
function holdCardWallet(
  card: CardWalletOf,
  follow: boolean,
  show: (loaded: Loaded) => void,
  received?: (payments: WalletPayment[]) => void
): WalletHold {
  let stopped = false;
  let leased: { lease: CardWalletLease; numbered: number; shown: number } | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  // Stops listening to its SDK's events, once it listens.
  let unwatch: (() => Promise<void>) | null = null;
  // Once stopped, a read's failure is no failure of what shows (the lease released under it ends
  // its sync's wait with an error, its next call with `notConnected`): not in the journal, where
  // every card's wallet let go mid-read would otherwise leave one. Held again, it is read again.
  const failed = (what: string, error: unknown) => {
    if (!stopped) logFailure(what, error);
  };

  // The ids of the payments it received, from its first read on: null until that read listed
  // them (synced: never one of them told as new). Its newest page is enough: every later look reads
  // that page only, where an older payment never comes back above the newer ones. Only grows, so
  // that reads answering out of order never tell one twice.
  let known: Set<string> | null = null;
  const look = async (lease: CardWalletLease) => {
    if (!received) return;
    // Newest first: what it received since its last look is at the top.
    const { payments } = await lease.wallet.listPaymentsPage({ limit: RECEIPTS_PAGE_SIZE });
    const receipts = payments.filter(isReceipt);
    const seen = known;
    if (seen === null) {
      known = new Set(receipts.map((payment) => payment.id));
      return;
    }
    const fresh = receipts.filter((payment) => !seen.has(payment.id));
    for (const payment of fresh) seen.add(payment.id);
    if (!stopped && fresh.length > 0) received(fresh);
  };

  // A payment its SDK says it received (its event): told at once, then known, never told again.
  // Before the first listing (`known` null), that listing has it: not told twice either.
  const tell = (payment: WalletPayment) => {
    if (!received || stopped || !isReceipt(payment)) return;
    if (known?.has(payment.id)) return;
    known?.add(payment.id);
    received([payment]);
  };

  const read = async (held: NonNullable<typeof leased>) => {
    let order = 0;
    const view = await readCardWallet(held.lease, () => {
      order = ++held.numbered;
    });
    if (stopped) return;
    // What the account keeps, for the check of its recovery phrase (holdings.ts).
    noteCardHeld(card, view.balanceSats);
    if (order >= held.shown) {
      held.shown = order;
      show({ status: "ready", lease: held.lease, view });
    }
    // Its receipts looked for once its balance shows them; their failure is not its balance's.
    await look(held.lease).catch((error: unknown) =>
      failed("Reading a card's receipts failed", error)
    );
  };

  // A read asked by an event (or the timer): one at a time, one more once it ends if asked
  // meanwhile (an event's burst: pending, then succeeded, then synced).
  let following: Promise<void> | null = null;
  let followAgain = false;
  const readSoon = (held: NonNullable<typeof leased>) => {
    if (stopped) return;
    if (following) {
      followAgain = true;
      return;
    }
    following = read(held)
      .catch((error: unknown) => failed("Reading a card's wallet again failed", error))
      .finally(() => {
        following = null;
        if (followAgain) {
          followAgain = false;
          readSoon(held);
        }
      });
  };

  withCardAccess((access) => leaseCardWallet(access, card))
    .then(async (lease) => {
      // Gone meanwhile: the lease goes at once.
      if (stopped) {
        await lease.release();
        return;
      }
      const held = { lease, numbered: 0, shown: 0 };
      leased = held;
      await read(held);
      if (follow && !stopped) {
        lease.wallet
          .watchChanges((succeeded) => {
            if (succeeded) tell(succeeded);
            readSoon(held);
          })
          .then(
            (stop) => {
              if (stopped) void stop();
              else unwatch = stop;
            },
            (error: unknown) => {
              failed("Listening to a card's wallet failed", error);
              // Not listened to: read again on a timer instead, else nothing it receives shows.
              if (!stopped) timer = setInterval(() => readSoon(held), UNHEARD_READ_MS);
            }
          );
      }
    })
    .catch((error: unknown) => {
      failed("Reading a card's wallet failed", error);
      if (!stopped) show({ status: "failed" });
    });

  return {
    refresh() {
      const held = leased;
      if (held === null || stopped) return null;
      return (async () => {
        try {
          // What was sent to it meanwhile is claimed first.
          await held.lease.wallet.sync().catch(() => undefined);
          await read(held);
        } catch (error) {
          failed("Reading a card's wallet again failed", error);
        }
      })();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      // Before its lease goes: another may keep it connected.
      void unwatch?.();
      void leased?.lease.release();
    }
  };
}

/**
 * The card's wallet while what shows it is mounted: leased then (holdCardWallet), released when it
 * goes; none for a null `card` ("loading"). `follow`: read again as its SDK says something
 * moved (holdCardWallet).
 * `refresh()` reads it again, synced first (after a recharge); `retry()` leases it again after a
 * failure. What a lease gave is kept with its card and attempt: another card's (or an earlier
 * attempt's) never shows, "loading" until its own answers.
 */
export function useCardWallet(
  card: CardWalletOf | null,
  { follow = false }: { follow?: boolean } = {}
) {
  const cardId = card?.cardId ?? null;
  const generation = card?.walletGeneration ?? null;
  const [attempt, setAttempt] = useState(0);
  const key = `${cardId}/${generation}/${attempt}`;
  const [result, setResult] = useState<{ key: string; loaded: Loaded } | null>(null);
  const loaded: Loaded = result?.key === key ? result.loaded : { status: "loading" };
  const [refreshing, setRefreshing] = useState(false);
  const current = useRef<WalletHold | null>(null);

  useEffect(() => {
    if (cardId === null || generation === null) return;
    const hold = holdCardWallet({ cardId, walletGeneration: generation }, follow, (next) =>
      setResult({ key, loaded: next })
    );
    current.current = hold;
    return () => {
      if (current.current === hold) current.current = null;
      hold.stop();
    };
  }, [cardId, generation, key, follow]);

  const refresh = useCallback(async () => {
    const reading = current.current?.refresh() ?? null;
    if (reading === null) return;
    setRefreshing(true);
    try {
      await reading;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { loaded, refreshing, refresh, retry };
}

/** Which wallet a card pays from, whatever the attempt: `<card id>/<generation>`. */
function walletPathOf(card: CardWalletOf): string {
  return `${card.cardId}/${card.walletGeneration}`;
}

/**
 * What useCardWallets shows: each wallet's last read, by key; those being read again, and among
 * them those whose last read is not shown meanwhile (`refreshing`).
 */
type HeldWallets = {
  shown: ReadonlyMap<string, Loaded>;
  refreshing: ReadonlySet<string>;
  rereading: ReadonlySet<string>;
};

/** What a card's wallet received (holdCardWallet's `received`), told with its card. */
export type CardReceived = (card: CardWalletOf, payments: WalletPayment[]) => void;

/**
 * The wallets of useCardWallets, each held (holdCardWallet) while wanted, by key (its card, its
 * generation, its attempt): a store outside React (useSyncExternalStore). A wallet let go takes
 * what it showed with it, and nothing it reads later shows: held again, it shows "loading" until
 * its new lease answers. What a wallet held receives is told to `received`, as last set.
 */
function createHeldWallets() {
  const holds = new Map<string, WalletHold>();
  // By key: its reads again (`refresh`) not ended yet, all of them and those shown as such.
  const readingAgain = new Map<string, number>();
  const readingShown = new Map<string, number>();
  let received: CardReceived | null = null;
  let held: HeldWallets = { shown: new Map(), refreshing: new Set(), rereading: new Set() };
  const listeners = new Set<() => void>();
  const change = (next: Partial<HeldWallets>) => {
    held = { ...held, ...next };
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: (): HeldWallets => held,
    /** Holds the wallets `wanted`, lets the others go: those held already stay connected. */
    hold(wanted: readonly { key: string; card: CardWalletOf }[]): void {
      const keys = new Set(wanted.map(({ key }) => key));
      for (const [key, hold] of holds) {
        if (keys.has(key)) continue;
        hold.stop();
        holds.delete(key);
      }
      for (const { key, card } of wanted) {
        if (holds.has(key)) continue;
        const hold: WalletHold = holdCardWallet(
          card,
          true,
          (loaded) => {
            if (holds.get(key) === hold) change({ shown: new Map(held.shown).set(key, loaded) });
          },
          (payments) => {
            if (holds.get(key) === hold) received?.(card, payments);
          }
        );
        holds.set(key, hold);
      }
      if ([...held.shown.keys()].some((key) => !keys.has(key))) {
        change({ shown: new Map([...held.shown].filter(([key]) => keys.has(key))) });
      }
    },
    /** Tells what the wallets held receive to `next` (null: to nothing). */
    tell(next: CardReceived | null): void {
      received = next;
    },
    /**
     * Reads the wallet `key` again, synced first; nothing before it is leased. `quiet`: its last
     * read stays shown meanwhile (`rereading` only), as nothing says its sats moved.
     */
    async refresh(key: string, quiet: boolean): Promise<void> {
      const reading = holds.get(key)?.refresh() ?? null;
      if (reading === null) return;
      // Read again twice at once (a recharge done, then its panel closed): until both end.
      const counts = quiet ? [readingAgain] : [readingAgain, readingShown];
      for (const count of counts) count.set(key, (count.get(key) ?? 0) + 1);
      const sets = () => ({
        refreshing: new Set([...readingShown.keys()]),
        rereading: new Set([...readingAgain.keys()])
      });
      change(sets());
      try {
        await reading;
      } finally {
        for (const count of counts) {
          const left = (count.get(key) ?? 1) - 1;
          if (left > 0) count.set(key, left);
          else count.delete(key);
        }
        change(sets());
      }
    }
  };
}

/** A card's wallet as "Cards" holds it (useCardWallets). */
export type HeldCardWallet = {
  loaded: Loaded;
  /** Being read again (`refresh`), not quietly: what it showed is not shown meanwhile. */
  refreshing: boolean;
  /** Being read again (`refresh`), quietly or not: what it showed may be no longer so. */
  rereading: boolean;
  /** `quiet`: what it showed stays shown meanwhile (`rereading` only). */
  refresh(options?: { quiet?: boolean }): Promise<void>;
  retry(): void;
};

/**
 * The wallets of `cards`, each leased and followed as useCardWallet's (`follow`) while it is among
 * them, all at once: "Cards" reads every card's balance as it shows, and a card chosen shows its
 * own at once, its wallet neither connected nor read again for it. A card added or gone leases or
 * lets go its own wallet only: the others stay connected. All go once unmounted. Gives each card's
 * wallet ("loading" for a card not among them). What each receives
 * meanwhile is told to `onReceived` (holdCardWallet's `received`).
 */
export function useCardWallets(
  cards: readonly CardWalletOf[],
  onReceived?: CardReceived
): (card: CardWalletOf) => HeldCardWallet {
  const [wallets] = useState(createHeldWallets);
  const { shown, refreshing, rereading } = useSyncExternalStore(
    wallets.subscribe,
    wallets.snapshot,
    wallets.snapshot
  );
  // By wallet: its attempt (retry), each one a lease of its own.
  const [attempts, setAttempts] = useState<ReadonlyMap<string, number>>(new Map());
  const keyOf = (card: CardWalletOf) =>
    `${walletPathOf(card)}/${attempts.get(walletPathOf(card)) ?? 0}`;
  // The wallets wanted, kept until they change: not at each render (useCards gives a new list).
  const wanted = cards.map((card) => ({ key: keyOf(card), card }));
  const id = wanted.map(({ key }) => key).join(",");
  const [list, setList] = useState({ id, wanted });
  if (list.id !== id) setList({ id, wanted });
  useEffect(() => {
    wallets.hold(list.wanted);
  }, [wallets, list]);
  useEffect(() => () => wallets.hold([]), [wallets]);
  useEffect(() => {
    wallets.tell(onReceived ?? null);
    return () => wallets.tell(null);
  }, [wallets, onReceived]);

  return (card) => {
    const key = keyOf(card);
    const path = walletPathOf(card);
    return {
      loaded: shown.get(key) ?? { status: "loading" },
      refreshing: refreshing.has(key),
      rereading: rereading.has(key),
      refresh: ({ quiet = false } = {}) => wallets.refresh(key, quiet),
      retry: () => setAttempts((before) => new Map(before).set(path, (before.get(path) ?? 0) + 1))
    };
  };
}

/**
 * The account's wallet held while `wanted` (holdAccountWallet), let go once not: connected if no
 * screen had it, disconnected again then if nothing else holds it. Its failure goes to the journal
 * only: what needs it ("Top up"'s read, a transfer) holds it in its turn, and says so. Never
 * for an account without a wallet of its own (a card holder's, main-wallet.ts): nothing asked.
 */
export function useHeldAccountWallet(wanted: boolean): void {
  useEffect(() => {
    if (!wanted || !hasMainWallet()) return;
    let gone = false;
    let release: (() => Promise<void>) | null = null;
    holdAccountWallet().then(
      (done) => {
        if (gone) void done();
        else release = done;
      },
      (error: unknown) => logFailure("Holding the main wallet failed", error)
    );
    return () => {
      gone = true;
      // At once: a screen shown next finds it closed already, never closed under it later.
      void release?.();
    };
  }, [wanted]);
}
