import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { getAccountTeamKeys } from "@/features/account/session";
import { readRecoveredTransactions } from "@/features/wallet/funds-recovery";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import { NO_NOTES, movementOf, senderNoteOf, walletMovementsOf } from "@/lib/card/card-movement";
import { movementKey, type HistoryCopy, type MovementCopy } from "@/lib/card/history-records";
import { sameCardWallet } from "@/lib/card/keys";
import type { MonthHead } from "@/lib/card/month-head";
import { CARD_PAYMENTS_KEPT_MS, type CardPaymentEntry } from "@/lib/card/payment-entry";
import { loadCardPayments } from "@/lib/card/payment-log";
import { deviceCalendar } from "@/lib/locale/calendar";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";

import {
  leaseCardWallet,
  listCardWalletPayments,
  readCardWallet,
  type CardWalletLease,
  type CardWalletOf
} from "./card-wallet";
import { readCardHistoryMonth } from "./history-copies";
import {
  copyCardLegacyHistory,
  legacyCopyState,
  readCardLegacyHistory,
  type CardLegacyHistory,
  type LegacyCopyOutcome
} from "./legacy-history";
import {
  readCardHistory,
  recordCardMovements,
  withdrawalNotesOf,
  type CardHistory
} from "./history-sync";
import {
  copyShown,
  firstHorizon,
  historyRows,
  migrationTransfers,
  monthHeadsOf,
  olderStep,
  sentFees,
  type CardHistoryRow
} from "./history-view";
import { withCardAccess, type CardAccess } from "./states";

/*
 * What "History" shows of a card (history-view.ts), read when it opens: the phone's log at
 * once (its own payments decide), the account's relays (every device's payments, the movements'
 * records), and the card's wallet (its movements and deposits, synced), whose movements are then
 * recorded with their value (recordCardMovements). Beyond the records' 90 days, a month at a time
 * on demand, as the device counts months (its time zone): the copies of the months in UTC that hold
 * some of it (history-copies.ts), and what the wallet holds of it. The month offered is one known
 * to show something: the copy that tells it is read first, at once (olderStep). The same on the web
 * app, without a log: there nothing shows
 * before a majority of the relays answered.
 *
 * A card migrated from Swiss Bitcoin Pay shows its v2 history too, once its copy is on the relays
 * (legacy-history.ts). A copy missing is made once per run of the
 * app, without a PIN, by the number printed on the card (its relays' record of it, else its
 * issuer's visual); a card with a PIN asks it of its holder (`legacy.phase` "pin", `copyLegacy`),
 * a failure offers to try again.
 */

/**
 * What the card's wallet told, synced: its payments (its movements once the withdrawals' notes are
 * read: walletMovementsOf), what their payers wrote, its payments' fees, its deposits.
 */
type WalletRead = {
  payments: WalletPayment[];
  /** By movement (movementKey): what its payer wrote (senderNoteOf). */
  notes: ReadonlyMap<string, string>;
  fees: ReadonlyMap<string, bigint>;
  pending: PendingDeposit[];
};

type Loaded = {
  /** Which read: a new one ("Try again") never shows an earlier one's answers. */
  round: number;
  /** When it was read (ms): its 90 days and its months count from then. */
  now: number;
  /** The phone's log, null until read (the web app keeps none). */
  own: CardPaymentEntry[] | null;
  /** The relays' answer, null until it came. */
  history: CardHistory | null;
  /**
   * The card's wallet: null while it is read, `failed` when it could not be; read again
   * (`refresh()`), the earlier read until the new one replaces it.
   */
  wallet: WalletRead | "failed" | null;
  /**
   * This round could not read the card's wallet: what shows of it, if anything, is an earlier
   * round's, its latest movements maybe missing (said, as on a first read).
   */
  walletFailed: boolean;
  /** The movements recorded as it opened, with their values (recordCardMovements). */
  recorded: MovementCopy[];
  /**
   * The transactions that brought funds back to the card's wallet (funds-recovery.ts), read once
   * it shows a deposit: their rows say "Funds recovered". Empty until read, or unread.
   */
  recovered: ReadonlySet<string>;
  /** The account closed meanwhile, or (the web app) no majority of the relays answered. */
  failed: boolean;
  /** The card's v2 history as the relays hold it; null until read (or the read failed). */
  legacy: CardLegacyHistory | null;
};

/**
 * Where the copy of the card's v2 history stands: nothing to do (`none`: no v2 card, its copy shown,
 * or the v2 server knows no card of its number), being made (`copying`), its PIN to give (`pin`), or
 * failed (`failed`: "Try again").
 */
export type LegacyCopyPhase = "none" | "copying" | "pin" | "failed";

/** A month's copy read (UTC), and whether it was whole. */
type ReadCopy = {
  month: string;
  /** Some of its parts were missing: some of its month may be too. */
  complete: boolean;
  /** Some of its parts are of a newer format: their movements are left out. */
  newer: boolean;
};

/** The months shown beyond the records: their copies read, and how far back the list goes. */
type Older = {
  round: number;
  horizon: number;
  /** The copies read, those of the months shown and those read to know the month to offer. */
  copies: ReadCopy[];
  taps: HistoryCopy[];
  movements: MovementCopy[];
  /** A month's read in progress, or the last one failed (no majority of the relays answered). */
  phase: "idle" | "loading" | "failed";
};

export type CardHistoryView = {
  /** `loading`: nothing to show yet; `failed`: nothing can be shown ("Try again"). */
  phase: "loading" | "failed" | "ready";
  rows: CardHistoryRow[];
  /** What happened before this (ms) is not shown: the records' 90 days, or a month shown beyond. */
  horizon: number;
  /** The card's on-chain deposits not in its balance yet; null when its wallet was not read. */
  pending: PendingDeposit[] | null;
  /** What the card's wallet paid on top of its payments, by payment hash (lowercase). */
  fees: ReadonlyMap<string, bigint>;
  /** The relays or the card's wallet still being read: more may come. */
  reading: boolean;
  /** On the phone, no majority of the relays answered: its own payments only. */
  ownOnly: boolean;
  /** The card's wallet could not be read: its latest recharges and returns may be missing. */
  walletFailed: boolean;
  /** Records of a newer format left out. */
  newer: boolean;
  /** The copy of the card's v2 history (LegacyCopyPhase). */
  legacy: LegacyCopyPhase;
  /**
   * The card's v2 history could not be read whole (no majority of the relays answered it): some of
   * its rows may be missing.
   */
  legacyUnread: boolean;
  /**
   * The month a step back would show, null when nothing older is kept (`partly`: some of it shows
   * already, the list reaching into it), or while the copies that tell it are read (`ahead`); that
   * step's state; a copy of a month shown lacked some of its parts (`incomplete`).
   */
  older: {
    month: string | null;
    partly: boolean;
    ahead: boolean;
    phase: Older["phase"];
    incomplete: boolean;
  };
};

function freshLoad(round: number): Loaded {
  return {
    round,
    now: Date.now(),
    own: null,
    history: null,
    wallet: null,
    walletFailed: false,
    recorded: [],
    recovered: NOTHING_RECOVERED,
    failed: false,
    legacy: null
  };
}

/** What "History" says of a copy that ended so (LegacyCopyPhase). */
function phaseOf(outcome: LegacyCopyOutcome): LegacyCopyPhase {
  switch (outcome) {
    case "copied":
    case "unknownCard":
      return "none";
    case "pinRequired":
    case "pinInvalid":
    case "pinLocked":
      return "pin";
    case "failed":
      return "failed";
  }
}

const NOTHING_RECOVERED: ReadonlySet<string> = new Set();

/** A read of the card's v2 history that failed whole: nothing proven. */
const UNREAD_LEGACY: CardLegacyHistory = {
  conclusive: false,
  rows: null,
  newer: false,
  number: null
};

/**
 * Once a copy of the card's v2 history ended (`outcome`): its copy read again when it was made, for
 * its rows to show (`update`); what "History" says of it then.
 */
async function afterCopy(
  access: CardAccess,
  wallet: CardWalletOf,
  outcome: LegacyCopyOutcome,
  update: (change: (value: Loaded) => Loaded) => void
): Promise<LegacyCopyPhase> {
  if (outcome !== "copied") return phaseOf(outcome);
  const again = await readCardLegacyHistory(access, wallet);
  update((value) => ({ ...value, legacy: again }));
  // Made, and yet no majority of the relays gives it back: to make again.
  return again.rows === null && !again.newer ? "failed" : "none";
}

/** What a read that failed whole tells: nothing proven (as a read no majority answered). */
const UNREAD: CardHistory = {
  entries: [],
  movements: [],
  heads: new Map(),
  withdrawals: new Map(),
  recorded: { taps: [], movements: [] },
  newerAt: new Set(),
  conclusive: false,
  newer: false,
  relays: []
};

/**
 * The history of `card` (its wallet: CardWalletOf), read when it mounts and again with `reload()`
 * (from nothing) or `refresh()` (what shows kept until the new reads replace it);
 * `showOlder()` shows the next older month (`view.older.month`). `printed`: the number printed on
 * the card when it was a v2 card (its issuer's visual), null otherwise. `copyLegacy(pin)` makes the
 * copy of its v2 history (`pin`: its v2 PIN, null for none), resolving with how it ended.
 */
export function useCardHistory(card: CardWalletOf, printed: string | null = null) {
  const { cardId, walletGeneration } = card;
  const [loaded, setLoaded] = useState<Loaded>(() => freshLoad(0));
  const [older, setOlder] = useState<Older | null>(null);
  // Kept across rounds, by card's wallet: a copy made, or its PIN asked, does not start again at
  // each read, and a copy that ends after another read began still says how it ended (never a
  // "copying" left behind). Another card shown meanwhile ("Cards" on a computer) has its own.
  const walletKey = `${cardId}/${walletGeneration}`;
  const [legacyState, setLegacyState] = useState<{ key: string; phase: LegacyCopyPhase }>({
    key: walletKey,
    phase: "none"
  });
  const legacyPhase = legacyState.key === walletKey ? legacyState.phase : "none";
  const setLegacyPhase = (phase: LegacyCopyPhase) => setLegacyState({ key: walletKey, phase });
  const { round } = loaded;
  // The read shown, for an answer that comes once another started (read in callbacks only).
  const shown = useRef(round);
  const onWeb = Platform.OS === "web";

  useEffect(() => {
    shown.current = round;
    let alive = true;
    const update = (change: (value: Loaded) => Loaded) => {
      if (alive) setLoaded((value) => (value.round === round ? change(value) : value));
    };
    if (!onWeb) {
      loadCardPayments().then(
        (log) => update((value) => ({ ...value, own: log })),
        (error: unknown) => {
          // A newer app's log: its payments are not shown, the relays' still are.
          logFailure("Reading the card payments failed", error);
          update((value) => ({ ...value, own: [] }));
        }
      );
    }
    withCardAccess(async (access) => {
      const historyRead = readCardHistory(access).then(
        (history) => history,
        (error: unknown) => {
          logFailure("Reading the card history failed", error);
          return UNREAD;
        }
      );
      void historyRead.then((history) =>
        update((value) => ({ ...value, history, failed: onWeb && !history.conclusive }))
      );
      let lease: CardWalletLease | null = null;
      // This round's movements shown: only their records may fail after.
      let walletShown = false;
      try {
        lease = await leaseCardWallet(access, { cardId, walletGeneration });
        // Synced first: its storage alone may miss its latest payments and deposits.
        const { pending } = await readCardWallet(lease);
        const payments = await listCardWalletPayments(lease);
        const notes = new Map(
          payments.flatMap((payment): [string, string][] => {
            const note = senderNoteOf(payment);
            return note ? [[movementKey({ cardId, id: payment.id }), note]] : [];
          })
        );
        // A deposit claimed between the two reads shows once: as the payment the wallet lists.
        const listed = new Set(payments.flatMap((payment) => payment.txId ?? []));
        update((value) => ({
          ...value,
          wallet: {
            payments,
            notes,
            fees: sentFees(payments),
            pending: pending.filter((deposit) => !listed.has(deposit.txid))
          },
          walletFailed: false
        }));
        walletShown = true;
        // Its deposits that brought funds back (funds-recovery.ts), alongside: none, no read.
        const team = getAccountTeamKeys();
        const deposits = payments.some((payment) => {
          const movement = movementOf({ cardId, walletGeneration }, payment, NO_NOTES);
          return movement?.kind === "recharge" && movement.way === "onchain";
        });
        if (team && deposits) {
          void readRecoveredTransactions(
            team,
            lease.walletId,
            { kind: "card", cardId, walletGeneration },
            currentRelays()
          )
            .then((found) => {
              if (found) update((value) => ({ ...value, recovered: new Set(found.keys()) }));
            })
            .catch((error: unknown) => {
              logFailure("Reading a card's recovered funds failed", error);
            });
        }
        const recorded = await recordCardMovements(access, lease, await historyRead);
        update((value) => ({ ...value, recorded }));
      } catch (error) {
        logFailure("Reading a card's wallet for its history failed", error);
        // Its movements read already: only their records failed. Otherwise an earlier round's read
        // stays, said not to be the latest.
        if (!walletShown) {
          update((value) => ({ ...value, wallet: value.wallet ?? "failed", walletFailed: true }));
        }
      } finally {
        // The relays' read ends before the access does (its keys wiped then).
        await historyRead;
        await lease?.release();
      }
    }).catch((error: unknown) => {
      logFailure("Reading a card's history failed", error);
      update((value) => ({ ...value, failed: true }));
    });
    // The card's v2 history: its copy read, then made when it is missing, once per run of the app
    // (legacy-history.ts); a copy running, from the migration or another read, waited for. Its
    // phase is the card's wallet's (setPhase), whatever read is shown when the copy ends.
    const setPhase = (phase: LegacyCopyPhase) =>
      setLegacyState({ key: `${cardId}/${walletGeneration}`, phase });
    withCardAccess(async (access) => {
      const wallet = { cardId, walletGeneration };
      const read = await readCardLegacyHistory(access, wallet);
      update((value) => ({ ...value, legacy: read }));
      const number = read.number ?? printed;
      if (!read.conclusive || read.rows !== null || read.newer || number === null) {
        if (read.rows !== null) setPhase("none");
        return;
      }
      const known = legacyCopyState(access, wallet);
      if (known !== null && !(known instanceof Promise)) {
        // Copied this run (maybe since this read): read again, "Try again" only if still missing.
        setPhase(
          known === "copied" ? await afterCopy(access, wallet, known, update) : phaseOf(known)
        );
        return;
      }
      setPhase("copying");
      const outcome = await (known ?? copyCardLegacyHistory(access, wallet, number, null));
      setPhase(await afterCopy(access, wallet, outcome, update));
    }).catch((error: unknown) => {
      logFailure("Reading a card's v2 history failed", error);
      update((value) => ({ ...value, legacy: UNREAD_LEGACY }));
    });
    return () => {
      alive = false;
    };
  }, [cardId, walletGeneration, round, onWeb, printed]);

  /**
   * Makes the copy of the card's v2 history now ("Try again", or its v2 `pin` given: null for
   * none), then reads it: how it ended.
   */
  const copyLegacy = async (pin: string | null): Promise<LegacyCopyOutcome> => {
    const number = loaded.legacy?.number ?? printed;
    if (number === null) return "unknownCard";
    if (pin === null) setLegacyPhase("copying");
    try {
      return await withCardAccess(async (access) => {
        const wallet = { cardId, walletGeneration };
        const outcome = await copyCardLegacyHistory(access, wallet, number, pin);
        const phase = await afterCopy(access, wallet, outcome, (change) =>
          setLoaded((value) => (value.round === round ? change(value) : value))
        );
        setLegacyPhase(phase);
        return outcome;
      });
    } catch (error) {
      // No account open, or it closed meanwhile.
      logFailure("Copying a card's v2 history failed", error);
      setLegacyPhase("failed");
      return "failed";
    }
  };

  const { history, wallet, own } = loaded;
  const walletRead = wallet !== null && wallet !== "failed" ? wallet : null;
  // A Spark transfer sent is a return or a withdrawal once the notes are read (card-movement.ts).
  const walletMovements = walletRead
    ? walletMovementsOf(
        { cardId, walletGeneration },
        walletRead.payments,
        history ? withdrawalNotesOf(history) : NO_NOTES
      )
    : null;
  // Where the records' 90 days start: the list shows the months' copies before.
  const recordsFrom = firstHorizon(loaded.now);
  const shownOlder: Older =
    older?.round === round
      ? older
      : {
          round,
          horizon: recordsFrom,
          copies: [],
          taps: [],
          movements: [],
          phase: "idle"
        };
  // The card's v2 history, its rows that show: never the transfer of its balance at the migration
  // (history-view.ts, migrationTransfers).
  const legacyRows = loaded.legacy?.rows ?? [];
  const knownMovements = [
    ...(history?.movements ?? []),
    ...loaded.recorded,
    ...shownOlder.movements
  ].flatMap(({ movement }) => (sameCardWallet(movement, card) ? [movement] : []));
  for (const movement of walletMovements ?? []) {
    if (movement.kind !== "unidentified" && sameCardWallet(movement, card)) {
      knownMovements.push(movement);
    }
  }
  const transfers = migrationTransfers(legacyRows, knownMovements);
  // Beyond the records, once a majority of the relays answered only: the copy of every month a
  // majority took is known then, never a month shown from the card's wallet without its copy.
  const calendar = deviceCalendar();
  const read = new Set(shownOlder.copies.map(({ month }) => month));
  const step = history?.conclusive
    ? olderStep(
        shownOlder.horizon,
        { cardId, walletGeneration },
        {
          heads: history.heads,
          read,
          partial: new Set(
            shownOlder.copies.flatMap(({ month, complete, newer }) =>
              complete && !newer ? [] : [month]
            )
          ),
          taps: shownOlder.taps,
          movements: shownOlder.movements,
          wallet: walletMovements,
          legacy: legacyRows.filter(({ ref }) => !transfers.has(ref))
        },
        calendar
      )
    : null;
  const nextMonth = step?.month ?? null;
  // The copies to read before a month is offered (olderStep).
  const ahead = step?.unread ?? [];

  const change = (next: (value: Older) => Older) =>
    setOlder((value) => next(value?.round === round ? value : shownOlder));

  /**
   * Reads the copies `due`, then shows the list from `to` (null: read to know the month to offer);
   * a copy no majority of the relays gave keeps the list where it was, those read kept, the next
   * attempt reading the others only.
   */
  const readCopies = (due: readonly MonthHead[], to: number | null) => {
    change((value) => ({ ...value, phase: "loading" }));
    withCardAccess((access) =>
      Promise.all(
        due.map((head) =>
          readCardHistoryMonth(access, head).catch((error: unknown) => {
            logFailure("Reading a card's month failed", error);
            return null;
          })
        )
      )
    ).then(
      (copies) => {
        if (shown.current !== round) return;
        const taken = due.flatMap((head, index) => {
          const copy = copies[index];
          return copy ? [{ head, copy }] : [];
        });
        const failed = taken.length < due.length;
        change((value) => ({
          ...value,
          horizon: failed || to === null ? value.horizon : to,
          copies: [
            ...value.copies,
            ...taken.map(({ head, copy }) => ({
              month: head.month,
              complete: copy.complete,
              newer: copy.newer
            }))
          ],
          taps: [...value.taps, ...taken.flatMap(({ copy }) => copy.taps)],
          movements: [...value.movements, ...taken.flatMap(({ copy }) => copy.movements)],
          phase: failed ? "failed" : "idle"
        }));
      },
      (error: unknown) => {
        logFailure("Reading a card's month failed", error);
        if (shown.current === round) change((value) => ({ ...value, phase: "failed" }));
      }
    );
  };

  // The copies that tell the month to offer, read at once, a group after the other (each read
  // tells the next); after a failure, at the press of "Try again" only (showOlder).
  const aheadKey = `${round} ${ahead.map(({ month }) => month).join(" ")}`;
  const readAhead = useRef<() => void>(() => undefined);
  useEffect(() => {
    readAhead.current = () => {
      if (ahead.length > 0 && shownOlder.phase === "idle") readCopies(ahead, null);
    };
  });
  useEffect(() => {
    readAhead.current();
  }, [aheadKey, shownOlder.phase]);

  const showOlder = () => {
    if (!history || shownOlder.phase === "loading") return;
    if (ahead.length > 0) {
      readCopies(ahead, null);
      return;
    }
    if (nextMonth === null) return;
    const from = calendar.monthStart(nextMonth);
    // The copies that hold some of it not read yet, the next month's for its edge (monthHeadsOf).
    const due = monthHeadsOf(
      history.heads,
      { cardId, walletGeneration },
      nextMonth,
      calendar
    ).filter((head) => !read.has(head.month));
    if (due.length === 0) {
      // Only the card's wallet, or copies read already, hold something of that month.
      change((value) => ({ ...value, horizon: from, phase: "idle" }));
      return;
    }
    readCopies(due, from);
  };

  const reload = () => {
    setOlder(null);
    setLoaded((value) => freshLoad(value.round + 1));
  };
  // Read again without leaving what shows ("Cards" on a computer, once its balance shown moved):
  // the rows, and the months shown beyond the records, stay until the new reads replace them, and a
  // panel open over the list stays open. A month's read under way ends with
  // the round it began in: its button comes back.
  const refresh = () => {
    setOlder((value) =>
      value?.round === round
        ? { ...value, round: round + 1, phase: value.phase === "loading" ? "idle" : value.phase }
        : value
    );
    setLoaded((value) => ({ ...value, round: value.round + 1, now: Date.now() }));
  };

  // The relays' records of the last 90 days: the phone's log and the months' copies complete them
  // (a relay that keeps expired records shows nothing more).
  const recent = (history?.recorded.taps ?? []).filter(
    ({ entry }) => entry.at + CARD_PAYMENTS_KEPT_MS > loaded.now
  );
  const rows = historyRows({
    card: { cardId, walletGeneration },
    horizon: shownOlder.horizon,
    own: own ?? [],
    taps: [...recent, ...shownOlder.taps],
    movements: [...(history?.movements ?? []), ...loaded.recorded, ...shownOlder.movements],
    wallet: walletMovements,
    recovered: loaded.recovered,
    withdrawals: history ? withdrawalNotesOf(history).ways : undefined,
    notes: walletRead?.notes,
    legacy: legacyRows
  });
  const { legacy } = loaded;
  const view: CardHistoryView = {
    phase: loaded.failed
      ? "failed"
      : (onWeb ? history === null : own === null && history === null)
        ? "loading"
        : "ready",
    rows,
    horizon: shownOlder.horizon,
    pending: walletRead?.pending ?? null,
    fees: walletRead?.fees ?? new Map(),
    reading: history === null || wallet === null || legacy === null || legacyPhase === "copying",
    ownOnly: !onWeb && history !== null && !history.conclusive,
    walletFailed: loaded.walletFailed,
    // What a copy hides, said once it shows (copyShown); a newer app's part is not missing:
    // "newer" says why its movements do not show.
    newer:
      (history?.newer ?? false) ||
      (legacy?.newer ?? false) ||
      shownOlder.copies.some(
        ({ month, newer }) => newer && copyShown(month, shownOlder.horizon, recordsFrom)
      ),
    older: {
      month: nextMonth,
      partly: nextMonth !== null && rows.some((row) => calendar.monthOf(row.at) === nextMonth),
      ahead: ahead.length > 0,
      phase: shownOlder.phase,
      incomplete: shownOlder.copies.some(
        ({ month, complete, newer }) =>
          !complete && !newer && copyShown(month, shownOlder.horizon, recordsFrom)
      )
    },
    legacy: legacyPhase,
    legacyUnread: legacy !== null && !legacy.conclusive
  };
  return { view, reload, refresh, showOlder, copyLegacy };
}
