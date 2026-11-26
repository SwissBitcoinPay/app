import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { OptionCard } from "@/components/ui/OptionCard";
import { SheetPages } from "@/components/ui/sheet-pages";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { OtherAccountError, getAccountWalletId } from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { usePos } from "@/features/terminal/pos";
import { RecoveryCheckOverdueError, openAccountOverdue } from "@/features/recovery-check/overdue";
import { isLooserMode, bookOf, payeesView } from "@/lib/card/payee-book";
import { PasskeyError } from "@/lib/breez/errors";
import { cleanDescription } from "@/lib/card/card-invoice";
import type { CardState } from "@/lib/card/card-record";
import type { CardWalletOf } from "@/lib/card/keys";
import { payeeNameKey } from "@/lib/card/payee-names";
import {
  MAX_LOCAL_PAYEE_NAME_LENGTH,
  NewerCardPayeesError,
  loadPayeeBooks,
  renameCardPayee,
  type ApprovedPayee,
  type CardPayeeBooks,
  type CardPayeeMode,
  type CardPayees
} from "@/lib/card/payees";
import { formatDate, formatDateCapitalized, withYear } from "@/lib/locale/date";
import { logFailure } from "@/lib/log/log";
import { makeStyles, proseLineHeight, radius, sans, space, type, useTheme } from "@/theme";

import { cardLabel } from "./card-label";
import { satsText } from "./history-format";
import { useModifiedPhoneWarning } from "./modified-phone";
import { nodeName, payeeKindText, shortNode } from "./payee-label";
import { PayeeMark } from "./PayeeMark";
import { chooseCardPayeeMode, removeApprovedPayee } from "./payee-mode";
import { usePayeePayments, type PayeeTally } from "./payee-payments";
import { syncCardPayees } from "./payees-sync";

/*
 * "Cards", whom a card pays without asking (each card its own): the holder's mode for the card, and
 * the merchants approved for it, each shown by the name it declared (or the holder's own; its
 * node's, shortened, for one identified by it), never by its address, after the mark of how it is
 * identified (PayeeMark.tsx); renamed for the holder only, or removed. On the phone (its books,
 * which decide its payments, then what the relays add) and in the web app (what a majority of the
 * relays hold), every change published to the relays (payees-sync.ts).
 */

type PayeesView =
  | { phase: "loading" }
  | { phase: "failed"; reason: "newerApp" | "unreachable" | "failed" }
  /** `pending`: a change no majority of the relays took yet. */
  | { phase: "ready"; payees: CardPayees; pending: boolean };

/**
 * What the section shows of a card's wallet's book: nothing of books a newer app wrote some of.
 */
function viewOf(books: CardPayeeBooks, card: CardWalletOf): PayeesView {
  if (books.newerOnRelays) return { phase: "failed", reason: "newerApp" };
  const book = bookOf(books, card);
  return { phase: "ready", payees: payeesView(book), pending: book.unpublished.size > 0 };
}

function failureOf(reason: unknown): PayeesView {
  logFailure("Reading the approved merchants failed", reason);
  return {
    phase: "failed",
    reason: reason instanceof NewerCardPayeesError ? "newerApp" : "failed"
  };
}

/** The approved merchants, "Change mode", one merchant (its name the title). */
export type PayeesPage =
  { kind: "list" } | { kind: "mode" } | { kind: "payee"; id: string; label: string };

/** The modes in the order "Change mode" shows them, the recommended one first. */
const MODES_SHOWN: readonly CardPayeeMode[] = ["approved", "confirm", "automatic"];

const MODE_ICONS: Record<CardPayeeMode, IconName> = {
  automatic: "bolt",
  approved: "store",
  confirm: "lock"
};

/**
 * A merchant's name for the holder: theirs, else the one it declared (cleaned; a node's: its
 * alias), else its node's key for one identified by it that announced none.
 */
export function approvedPayeeLabel(payee: ApprovedPayee, t: TFunction): string {
  return (
    payee.localName ??
    cleanDescription(payee.lastName) ??
    (payee.by === "node" ? nodeName(payee.id, t) : t("card.payee.unnamed"))
  );
}

/** A card's mode as "Payments without confirmation" says it under its row (useCardPayeeMode). */
export type CardPayeeModeShown =
  | { status: "reading" }
  /** Not read: no majority of the relays gave it (the web app), or the books could not be read. */
  | { status: "unread" }
  /** A newer app wrote the books: no card pays from them until the app is updated. */
  | { status: "newer" }
  /** `pending`: a change of the card's book no majority of the relays took yet. */
  | { status: "known"; mode: CardPayeeMode; pending: boolean };

/**
 * The card's mode, as "Payments without confirmation" says it under its row: the phone's book at
 * once, then what the relays add (the web app: what a majority of them gave, nothing proven
 * otherwise). Read again with `round` (the panel closed after a change).
 */
export function useCardPayeeMode(card: CardWalletOf, round: number): CardPayeeModeShown {
  const { cardId, walletGeneration } = card;
  const walletId = getAccountWalletId();
  const [shown, setShown] = useState<{ key: string; mode: CardPayeeModeShown } | null>(null);
  const key = `${walletId}/${cardId}/${walletGeneration}/${round}`;
  const onWeb = Platform.OS === "web";
  useEffect(() => {
    if (walletId === null) return;
    let current = true;
    const show = (mode: CardPayeeModeShown) => {
      if (current) setShown({ key, mode });
    };
    const ofBooks = (books: CardPayeeBooks): CardPayeeModeShown => {
      if (books.newerOnRelays) return { status: "newer" };
      const book = bookOf(books, { cardId, walletGeneration });
      return { status: "known", mode: payeesView(book).mode, pending: book.unpublished.size > 0 };
    };
    // The phone's own book until the relays answered, never after (it may come last); kept when
    // they did not.
    let synced = false;
    let syncFailed = false;
    let localFailed = onWeb;
    if (!onWeb) {
      loadPayeeBooks(walletId).then(
        (books) => {
          if (!synced) show(ofBooks(books));
        },
        (reason: unknown) => {
          localFailed = true;
          if (reason instanceof NewerCardPayeesError) show({ status: "newer" });
          else if (syncFailed) show({ status: "unread" });
        }
      );
    }
    // A read of its own, after any running: one that started before a change would miss it.
    syncCardPayees({ fresh: true }).then(
      ({ books, conclusive }) => {
        synced = true;
        show(!onWeb || conclusive ? ofBooks(books) : { status: "unread" });
      },
      (reason: unknown) => {
        syncFailed = true;
        if (reason instanceof NewerCardPayeesError) {
          synced = true;
          show({ status: "newer" });
        } else if (localFailed) {
          show({ status: "unread" });
        }
      }
    );
    return () => {
      current = false;
    };
  }, [walletId, cardId, walletGeneration, key, onWeb]);
  return shown?.key === key ? shown.mode : { status: "reading" };
}

/**
 * The title of the page shown: "Payments without confirmation", "Change mode", or the merchant's
 * name.
 */
export function payeesPageTitle(page: PayeesPage, t: TFunction): string {
  return page.kind === "list"
    ? t("cards.home.payees")
    : page.kind === "mode"
      ? t("cards.payees.changeMode")
      : page.label;
}

/**
 * "Payments without confirmation" of a card, a page of its panel "Advanced settings"
 * (CardSheet.tsx): its mode and the merchants approved for it, each opening what changes it
 * (`page`: "Change mode", a merchant), the panel's title and way back following it. Read when it
 * shows; each visit starts on the list.
 */
export function PayeesPanel({
  walletId,
  card,
  panel,
  onPanel,
  onBusy
}: {
  walletId: string;
  card: CardState;
  panel: PayeesPage;
  onPanel: (panel: PayeesPage) => void;
  onBusy: (busy: boolean) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { cardId, walletGeneration } = card;
  // The book shown and changed: the card's current wallet's (payee-book.ts).
  const wallet: CardWalletOf = { cardId, walletGeneration };
  const [view, setView] = useState<PayeesView>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  // Read by the presses only: two in one frame start one change.
  const running = useRef(false);
  useEffect(() => {
    onBusy(busy);
    // Never left busy once the panel is gone.
    return () => onBusy(false);
  }, [busy, onBusy]);
  /** Why the last change was not kept; null when none failed. */
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const onWeb = Platform.OS === "web";
  const modifiedPhone = useModifiedPhoneWarning(walletId);
  const payments = usePayeePayments(
    card,
    view.phase === "ready" ? view.payees.approved : null,
    round
  );

  useEffect(() => {
    let current = true;
    // The phone's own book at once: it decides its payments, the relays only add to it.
    if (!onWeb) {
      loadPayeeBooks(walletId).then(
        (books) => {
          if (current) {
            setView((shown) =>
              shown.phase === "loading" ? viewOf(books, { cardId, walletGeneration }) : shown
            );
          }
        },
        (reason: unknown) => {
          if (current) setView(failureOf(reason));
        }
      );
    }
    syncCardPayees().then(
      ({ books, conclusive }) => {
        if (!current) return;
        // The web app keeps nothing of its own: what no majority of the relays gave is not proven.
        setView(
          onWeb && !conclusive
            ? { phase: "failed", reason: "unreachable" }
            : viewOf(books, { cardId, walletGeneration })
        );
      },
      (reason: unknown) => {
        if (!current) return;
        // The phone shows its book as it keeps it, unless a newer app wrote it.
        if (onWeb || reason instanceof NewerCardPayeesError) setView(failureOf(reason));
      }
    );
    return () => {
      current = false;
    };
  }, [walletId, cardId, walletGeneration, round, onWeb]);

  /** Runs a change of the book, shows it as kept, then as the relays took it. One at a time. */
  const change = (run: () => Promise<CardPayees>, then?: (payees: CardPayees) => void) => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setBusy(true);
    const done = () => {
      running.current = false;
      setBusy(false);
    };
    run().then(
      (payees) => {
        done();
        // Read again just after: until then, the change is not on the relays.
        setView({ phase: "ready", payees, pending: true });
        then?.(payees);
        // Read again first: another device may have changed it meanwhile.
        syncCardPayees({ fresh: true }).then(
          ({ books }) => setView(viewOf(books, wallet)),
          (reason: unknown) => logFailure("Publishing the approved merchants failed", reason)
        );
      },
      (reason: unknown) => {
        done();
        // The passkey's own failures say so; a dismissed prompt says nothing.
        if (
          reason instanceof PasskeyError ||
          reason instanceof OtherAccountError ||
          reason instanceof RecoveryCheckOverdueError
        ) {
          const unlock = toUnlockFailure(reason);
          if (unlock) logFailure("The passkey for a card's mode failed", reason);
          setError(unlock ? unlockFailureMessage(unlock, t) : null);
          return;
        }
        logFailure("Changing the approved merchants failed", reason);
        if (reason instanceof NewerCardPayeesError) setView(failureOf(reason));
        else setError(t("cards.payees.saveFailed"));
      }
    );
  };
  const retry = () => setRound((value) => value + 1);
  // A merchant removed meanwhile (another device): back to the list, as after its removal here.
  const gone =
    panel.kind === "payee" &&
    view.phase === "ready" &&
    !view.payees.approved.some((entry) => entry.id === panel.id);
  useEffect(() => {
    if (gone) onPanel({ kind: "list" });
  }, [gone, onPanel]);

  // The panel's waiting, its failures (a read, a change), its change not on the relays yet, as the
  // card's other panels say them.
  if (view.phase === "loading") {
    return (
      <View style={styles.waiting} testID="payees-loading">
        <Spinner size={18} />
      </View>
    );
  }
  if (view.phase === "failed") {
    return (
      <View style={styles.content} testID={`payees-${cardId}`}>
        <Callout tone="error" testID="payees-failed">
          {t(`cards.payees.failed.${view.reason}`)}
        </Callout>
        {view.reason === "newerApp" ? null : (
          <Button variant="secondary" onPress={retry} testID="payees-retry">
            {t("cards.retry")}
          </Button>
        )}
      </View>
    );
  }
  const { payees, pending } = view;
  const opened =
    panel.kind === "payee"
      ? (payees.approved.find((entry) => entry.id === panel.id) ?? null)
      : null;
  const tallyOf = (id: string): PayeeTally | null =>
    payments.status === "read" ? (payments.tallies.get(id) ?? null) : null;
  const remove = (payee: ApprovedPayee) =>
    change(
      () => removeApprovedPayee(walletId, wallet, payee.id),
      () => onPanel({ kind: "list" })
    );
  return (
    <View style={styles.content} testID={`payees-${cardId}`}>
      {error ? (
        <Callout tone="error" testID="payees-error">
          {error}
        </Callout>
      ) : null}
      {pending && !error ? (
        <View style={styles.content}>
          <Callout tone="warning" testID="payees-pending">
            {t(onWeb ? "cards.payees.pending.web" : "cards.payees.pending.phone")}
          </Callout>
          <Button variant="secondary" onPress={retry} testID="payees-pending-retry">
            {t("cards.retry")}
          </Button>
        </View>
      ) : null}
      {/* The list, the mode or a merchant: one fades into the other under the callouts they share,
          their reads kept (Sheet's pages). A merchant renamed stays the same page. */}
      <SheetPages
        page={
          panel.kind === "payee" && opened
            ? `payee:${opened.id}`
            : panel.kind === "mode"
              ? "mode"
              : "list"
        }
        style={styles.content}
      >
        {panel.kind === "mode" ? (
          <ModeChooser
            current={payees.mode}
            busy={busy}
            onCancel={() => onPanel({ kind: "list" })}
            onSave={(mode) => {
              // Past the check of the 12 words, no looser mode (chooseCardPayeeMode): said before
              // the passkey is asked.
              if (isLooserMode(mode, payees.mode) && openAccountOverdue()) {
                setError(t("account.errors.recoveryOverdue"));
                return;
              }
              change(
                () => chooseCardPayeeMode(walletId, wallet, mode),
                () => onPanel({ kind: "list" })
              );
            }}
          />
        ) : panel.kind === "payee" && opened ? (
          <PayeeDetail
            payee={opened}
            tally={tallyOf(opened.id)}
            busy={busy}
            onRename={(name) =>
              change(
                () => renameCardPayee(walletId, wallet, opened.id, name),
                (kept) => {
                  const renamed = kept.approved.find((entry) => entry.id === opened.id);
                  if (renamed) {
                    onPanel({
                      kind: "payee",
                      id: opened.id,
                      label: approvedPayeeLabel(renamed, t)
                    });
                  }
                }
              )
            }
            onRemove={() => remove(opened)}
          />
        ) : (
          <PayeesList
            card={card}
            payees={payees}
            modifiedPhone={modifiedPhone && payees.mode !== "confirm"}
            tallyOf={tallyOf}
            busy={busy}
            onMode={() => {
              setError(null);
              onPanel({ kind: "mode" });
            }}
            onOpen={(payee) => {
              setError(null);
              onPanel({
                kind: "payee",
                id: payee.id,
                label: approvedPayeeLabel(payee, t)
              });
            }}
            onRemove={remove}
          />
        )}
      </SheetPages>
    </View>
  );
}

/**
 * The card's mode, said, then "Change"; the approved merchants; how one gets approved. Above, where
 * this phone looks modified and the mode pays without asking, what it risks there
 * (modified-phone.ts).
 */
function PayeesList({
  card,
  payees,
  modifiedPhone,
  tallyOf,
  busy,
  onMode,
  onOpen,
  onRemove
}: {
  card: CardState;
  payees: CardPayees;
  modifiedPhone: boolean;
  tallyOf: (id: string) => PayeeTally | null;
  busy: boolean;
  onMode: () => void;
  onOpen: (payee: ApprovedPayee) => void;
  onRemove: (payee: ApprovedPayee) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  // Newest approval first: the order the holder met them in.
  const sorted = [...payees.approved].sort((a, b) => b.approvedAt - a.approvedAt);
  return (
    <>
      {modifiedPhone ? (
        <Callout
          tone="warning"
          title={t("cards.modifiedPhone.title")}
          testID="payees-modified-phone"
        >
          {t("cards.modifiedPhone.body")}
        </Callout>
      ) : null}
      {/* The box is pressed as a whole, a chevron at its end: a "Change" button beside the texts
          took nearly half the width, and with a larger font the title and the caption ran over
          three lines each. */}
      <View style={styles.modeBox}>
        <ListRow
          inset={14}
          accessibilityRole="button"
          accessibilityLabel={t("cards.payees.changeLabel", { name: cardLabel(card, t) })}
          disabled={busy}
          onPress={onMode}
          cornerRadius={radius.md}
          containerStyle={styles.modeOpen}
          style={styles.modeContent}
          testID="payees-mode-change"
        >
          <View style={styles.modeIcon}>
            <Icon name="shield-halved" size={14} color={colors.text.accent} />
          </View>
          <View style={styles.modeTexts} testID="payees-mode">
            <Text style={styles.modeTitle}>{t(`cards.payees.modeBox.${payees.mode}.title`)}</Text>
            <Text style={styles.modeCaption}>
              {t(`cards.payees.modeBox.${payees.mode}.caption`)}
            </Text>
          </View>
          <Icon name="chevron-right" size={12} color={colors.text.secondary} />
        </ListRow>
      </View>
      {/* The list is titled for the card it is of, not by the mode's name just above, its count
          beside it; empty, a dashed frame says so, and how a merchant gets approved in
          the mode where one can (as the invoice's empty lines, LinesStep.tsx). */}
      <View style={styles.group}>
        <Text style={styles.groupLabel} testID="payees-approved-label">
          {sorted.length === 0
            ? t("cards.payees.approved")
            : t("cards.payees.approvedCount", { count: sorted.length })}
        </Text>
        {sorted.length === 0 ? (
          <View style={styles.empty} testID="payees-empty">
            <Icon name="store" size={24} color={colors.text.secondary} />
            <Text style={styles.emptyTitle} testID="payees-empty-title">
              {t("cards.payees.approvedEmpty")}
            </Text>
            {/* The other modes never approve a merchant as a payment is confirmed: no lead
                rather than a false one (payee-decision.ts, approveOnConfirm). */}
            {payees.mode === "approved" ? (
              <Text style={styles.emptyLead} testID="payees-empty-lead">
                {t("cards.payees.approvedEmptyLead")}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.list} testID="payees-list">
            {sorted.map((payee, index) => (
              <PayeeRow
                key={payee.id}
                payee={payee}
                caption={rowCaption(payee, tallyOf(payee.id), t, languageTag)}
                separated={index < sorted.length - 1}
                busy={busy}
                onOpen={() => onOpen(payee)}
                onRemove={() => onRemove(payee)}
                testID={`payees-row-${index}`}
              />
            ))}
          </View>
        )}
        {/* A payment confirmed with "Approve this merchant" ticked approves its merchant, in
            "Approved merchants" only (payee-decision.ts, approveOnConfirm;
            CardPaymentSheet.tsx), said under the list (the empty frame says it itself). In the
            other modes, no note rather than a false one ("Automatic" still
            pays an approved merchant alone without asking while the app is closed on Android). */}
        {sorted.length > 0 && payees.mode === "approved" ? (
          <Text style={[styles.note, styles.groupNote]} testID="payees-approve-note">
            {t("cards.payees.approveNote")}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** "approved on 15 Oct · 3 payments": its count when it is proven (payee-payments.ts). */
function rowCaption(
  payee: ApprovedPayee,
  tally: PayeeTally | null,
  t: TFunction,
  languageTag: string
): string {
  // The year of an approval of another year.
  const approvedAt = new Date(payee.approvedAt);
  const date = formatDate(
    approvedAt,
    languageTag,
    withYear({ day: "numeric", month: "short" }, approvedAt)
  );
  const parts = [t("cards.payees.approvedOn", { date })];
  if (tally) {
    parts.push(
      t(tally.whole ? "cards.payees.payments" : "cards.payees.paymentsRecent", {
        count: tally.count
      })
    );
  }
  return parts.join(" · ");
}

function PayeeRow({
  payee,
  caption,
  separated,
  busy,
  onOpen,
  onRemove,
  testID
}: {
  payee: ApprovedPayee;
  caption: string;
  separated: boolean;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const label = approvedPayeeLabel(payee, t);
  return (
    <View style={[styles.row, separated && styles.rowSeparated]} testID={testID}>
      <ListRow
        inset={16}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${payeeKindText(payee.by, t)}, ${caption}`}
        onPress={onOpen}
        containerStyle={styles.rowOpen}
        style={styles.rowContent}
        testID={`${testID}-open`}
      >
        {/* Its initial, one letter. */}
        <Avatar name={Array.from(label)[0] ?? ""} image={null} size={38} tone="subtle" />
        <View style={styles.rowTexts}>
          <View style={styles.rowTitleLine}>
            <PayeeMark kind={payee.by} />
            <Text numberOfLines={1} style={[styles.rowTitle, styles.rowTitleText]}>
              {label}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.rowCaption}>
            {caption}
          </Text>
        </View>
      </ListRow>
      <IconButton
        icon="trash-can"
        label={t("cards.payees.removeLabel", { name: label })}
        size={14}
        color={colors.danger.fg}
        disabled={busy}
        onPress={onRemove}
        testID={`${testID}-remove`}
      />
    </View>
  );
}

/**
 * One merchant: its name, its approval, its payments; the holder's own name
 * for it; its removal, once the passkey confirms it (removeApprovedPayee), as its note says.
 */
function PayeeDetail({
  payee,
  tally,
  busy,
  onRename,
  onRemove
}: {
  payee: ApprovedPayee;
  tally: PayeeTally | null;
  /** A change runs: its buttons wait. */
  busy: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const desktop = useIsDesktop();
  const [text, setText] = useState(payee.localName ?? "");
  const tooLong = text.trim().length > MAX_LOCAL_PAYEE_NAME_LENGTH;
  const unchanged = text.trim() === (payee.localName ?? "");
  const declared = cleanDescription(payee.lastName);
  const former = cleanDescription(payee.approvedName);
  const node = payee.by === "node";
  const rows: { key: string; label: string; value: string }[] = [
    // A node's alias when it announced one, then its key (shortened).
    ...(node && declared === null
      ? []
      : [
          {
            key: "name",
            label: t("cards.payees.itsName"),
            value: declared ?? t("card.payee.unnamed")
          }
        ]),
    ...(node
      ? [{ key: "node", label: t("cards.payees.itsNode"), value: shortNode(payee.id) }]
      : []),
    // The name it was approved under, when it declares another one now.
    ...(former !== null && payeeNameKey(payee.approvedName) !== payeeNameKey(payee.lastName)
      ? [{ key: "former", label: t("cards.payees.approvedAs"), value: former }]
      : []),
    {
      key: "approved",
      label: t("cards.payees.approvedOnLabel"),
      value: formatDateCapitalized(
        new Date(payee.approvedAt),
        languageTag,
        withYear({ weekday: "long", day: "numeric", month: "long" }, new Date(payee.approvedAt))
      )
    },
    // Said only when proven (payee-payments.ts).
    ...(tally
      ? [
          {
            key: "payments",
            label: t("cards.payees.paymentsLabel"),
            value: t(
              tally.whole ? "cards.payees.paymentsValue" : "cards.payees.paymentsValueRecent",
              {
                count: tally.count,
                amount: satsText(tally.sats, languageTag)
              }
            )
          }
        ]
      : [])
  ];
  return (
    <View style={styles.content} testID="payees-payee">
      <View style={styles.facts}>
        {rows.map((row, index) => (
          <View
            key={row.key}
            style={[styles.fact, index < rows.length - 1 && styles.factSeparated]}
            testID={`payees-fact-${row.key}`}
          >
            <Text style={styles.factLabel}>{row.label}</Text>
            <Text style={styles.factValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.field}>
        <TextField
          label={t("cards.payees.nameField")}
          value={text}
          onChangeText={setText}
          maxLength={MAX_LOCAL_PAYEE_NAME_LENGTH}
          placeholder={declared ?? (node ? shortNode(payee.id) : undefined)}
          error={
            tooLong ? t("cards.sheet.nameInvalid", { max: MAX_LOCAL_PAYEE_NAME_LENGTH }) : null
          }
          testID="payees-name-field"
        />
        <Text style={styles.note}>{t("cards.payees.nameHint")}</Text>
      </View>
      {/* What approving a node means, as the payment said it. */}
      {node ? (
        <Callout tone="warning" testID="payees-node-note">
          {t("cards.payees.nodeNote")}
        </Callout>
      ) : null}
      {/* A name is saved when asked, never by leaving the panel. */}
      {unchanged ? null : (
        <Button
          size={desktop ? "sm" : undefined}
          fullWidth={!desktop}
          disabled={tooLong || busy}
          loading={busy}
          onPress={() => onRename(text)}
          style={desktop ? styles.dialogSave : undefined}
          testID="payees-name-save"
        >
          {t("cards.sheet.save")}
        </Button>
      )}
      {desktop ? (
        // What a removal means beside it, on one line.
        <View style={styles.removeRow}>
          <Text style={[styles.note, styles.removeHint]}>{t("cards.payees.removeHint")}</Text>
          <Button
            variant="destructive"
            size="sm"
            fullWidth={false}
            icon="trash-can"
            disabled={busy}
            onPress={onRemove}
            testID="payees-remove"
          >
            {t("cards.payees.remove")}
          </Button>
        </View>
      ) : (
        <View style={styles.removeBlock}>
          <Button
            variant="destructive"
            size="md"
            icon="trash-can"
            disabled={busy}
            onPress={onRemove}
            testID="payees-remove"
          >
            {t("cards.payees.remove")}
          </Button>
          <Text style={[styles.note, styles.centered]}>{t("cards.payees.removeHint")}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * "Change mode": a mode chosen, then saved once the passkey confirms it (chooseCardPayeeMode),
 * whatever the mode, as its button says: one rule, never a passkey asked for a looser mode only.
 */
function ModeChooser({
  current,
  busy,
  onCancel,
  onSave
}: {
  current: CardPayeeMode;
  busy: boolean;
  /** A desktop's "Cancel": back to the list, nothing changed. */
  onCancel: () => void;
  onSave: (mode: CardPayeeMode) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [chosen, setChosen] = useState(current);
  // Changed meanwhile (another device): chosen anew from it, once no save runs. Set while
  // rendering, as React advises.
  const [from, setFrom] = useState(current);
  if (current !== from && !busy) {
    setFrom(current);
    setChosen(current);
  }
  const changed = chosen !== current;
  return (
    <View style={styles.content}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("cards.payees.modesLabel")}
        style={styles.modes}
      >
        {MODES_SHOWN.map((option) => (
          <OptionCard
            key={option}
            title={t(`cards.payees.modes.${option}.title`)}
            tag={option === "approved" ? t("cards.payees.recommended") : undefined}
            description={t(`cards.payees.modes.${option}.body`)}
            leading={<Icon name={MODE_ICONS[option]} size={15} color={colors.text.accent} />}
            selected={option === chosen}
            disabled={busy}
            outlined={desktop}
            onPress={() => setChosen(option)}
            testID={`payees-mode-${option}`}
          />
        ))}
      </View>
      {desktop ? (
        // "Cancel" and its button, side by side.
        <View style={styles.dialogActions}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onPress={onCancel}
            style={styles.dialogCancel}
            testID="payees-mode-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            fullWidth={false}
            icon="key"
            disabled={!changed}
            loading={busy}
            onPress={() => onSave(chosen)}
            style={styles.dialogSave}
            testID="payees-mode-save"
          >
            {t("cards.payees.confirmPasskey")}
          </Button>
        </View>
      ) : (
        <Button
          icon="key"
          disabled={!changed}
          loading={busy}
          onPress={() => onSave(chosen)}
          testID="payees-mode-save"
        >
          {t("cards.payees.confirmPasskey")}
        </Button>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  content: { gap: space[5] },
  waiting: { alignItems: "center", paddingVertical: space[4] },
  // The row's pressed tint clipped to the box's corners (ListRow).
  modeBox: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.background.app },
  modeOpen: { paddingVertical: 14 },
  modeContent: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  modeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  modeTexts: { flex: 1, minWidth: 0, gap: 2 },
  modeTitle: { ...sans(600), fontSize: 14, color: colors.text.primary },
  modeCaption: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  group: { gap: 9 },
  groupLabel: {
    ...sans(600),
    paddingHorizontal: 4,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  groupNote: { paddingHorizontal: 4 },
  empty: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.text.tertiary,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8
  },
  emptyTitle: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary,
    textAlign: "center"
  },
  emptyLead: {
    ...sans(400),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    textAlign: "center"
  },
  list: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.background.surface,
    boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}`
  },
  row: { flexDirection: "row", alignItems: "center", minHeight: 62, paddingRight: 8 },
  rowSeparated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rowOpen: { flex: 1, paddingRight: 0, paddingVertical: 9 },
  rowContent: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  rowTexts: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitleText: { flexShrink: 1 },
  rowCaption: { ...sans(500), fontSize: 12, color: colors.text.secondary },
  facts: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.app,
    paddingVertical: 4,
    paddingHorizontal: 16
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 46
  },
  factSeparated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  factLabel: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  factValue: {
    ...sans(600),
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    color: colors.text.primary
  },
  field: { gap: 6 },
  modes: { gap: 10 },
  removeBlock: { gap: 6 },
  // A desktop's.
  dialogActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  dialogCancel: { minWidth: 120 },
  dialogSave: { minWidth: 180, alignSelf: "flex-end" },
  removeRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  removeHint: { flex: 1, minWidth: 0 },
  note: { ...sans(500), fontSize: type.caption, lineHeight: 18, color: colors.text.secondary },
  centered: { textAlign: "center" }
}));
