import * as Clipboard from "expo-clipboard";
import type { TFunction } from "i18next";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill, StatusPillBox } from "@/components/ui/StatusPill";
import { externalLinkProps } from "@/components/ui/external-link";
import { OtherAccountError, getAccountWalletId } from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { confirmAccountPasskey } from "@/features/account/wallet-access";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { useAmountUnit } from "@/features/settings/amount-unit";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { usePos } from "@/features/terminal/pos";
import { useRate } from "@/features/terminal/useRate";
import { useWalletFormat } from "@/features/wallet/format";
import { formatSignedFiat, satsToFiatMinor } from "@/features/wallet/model";
import { RecoveryCheckOverdueError } from "@/features/recovery-check/overdue";
import { PasskeyError } from "@/lib/breez/errors";
import type { CardMovement, UnidentifiedMovement } from "@/lib/card/card-movement";
import type { CardWalletOf } from "@/lib/card/keys";
import type { LegacyCardRow } from "@/lib/legacy-v2/card-history";
import { bookOf, payeesView, type CardPayeeBooks } from "@/lib/card/payee-book";
import { isPayeeHomonym } from "@/lib/card/payee-names";
import { identifiedPayeeOf, type CardPaymentEntry } from "@/lib/card/payment-entry";
import { approveCardPayee, loadPayeeBooks } from "@/lib/card/payees";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { normalTxid, explorerName, txPageUrl } from "@/lib/onchain/tx-page";
import {
  AMOUNT_EM,
  makeStyles,
  mono,
  radius,
  sans,
  space,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import {
  declaredName,
  msatsText,
  nothingMoved,
  paymentValue,
  satsText,
  tapTitle,
  unidentifiedTitle,
  valueText,
  type KeptValue
} from "./history-format";
import { refusalReasonOf, type CardHistoryRow } from "./history-view";
import { nodeName } from "./payee-label";
import { PayeeMark } from "./PayeeMark";
import { syncCardPayees } from "./payees-sync";

/*
 * The details of a movement of "History" (a payment paid or refused, a top-up or a return; a
 * withdrawal as a return, where it went in place of the main balance): its signed amount (its value
 * first, as the list, "Currency shown first": Figure), what it was, then its rows, each label after
 * an icon of its own: when, its value at the rate of its hour as it was kept and at the present's
 * (none kept: no row), what the wallet tells of it; never the card, which the screen's title names.
 * Only what is proven is said: a payment's fee as its card's wallet paid it (no row otherwise). Its
 * proof (its preimage) is kept, never shown. A refused payment to an identified merchant not
 * approved yet offers "Approve this merchant", with the passkey, when the card pays approved
 * merchants without asking: elsewhere its next payments would still be asked.
 */

/** The panel's title for `row`. */
export function detailTitle(row: CardHistoryRow, t: TFunction): string {
  if (row.kind === "legacy") {
    return t(
      row.row.kind === "recharge" ? "cards.history.recharge" : "cards.history.detail.payment"
    );
  }
  if (row.kind === "movement") {
    return t(row.movement.kind === "recharge" ? "cards.history.recharge" : "cards.history.return");
  }
  if (row.kind === "unidentified") return unidentifiedTitle(row.movement.direction, t);
  switch (row.entry.outcome) {
    case "declined":
      return t("cards.history.detail.refused");
    case "failed":
      return t("cards.history.detail.failed");
    default:
      return t("cards.history.detail.payment");
  }
}

export function CardHistoryDetail({
  row,
  fees
}: {
  row: CardHistoryRow;
  fees: ReadonlyMap<string, bigint>;
}) {
  switch (row.kind) {
    case "tap":
      return <TapDetail entry={row.entry} fees={fees} />;
    case "movement":
      return <MovementDetail movement={row.movement} note={row.note} />;
    case "unidentified":
      return <UnidentifiedDetail movement={row.movement} />;
    case "legacy":
      return <LegacyDetail row={row.row} />;
  }
}

function TapDetail({
  entry,
  fees
}: {
  entry: CardPaymentEntry;
  fees: ReadonlyMap<string, bigint>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const moved = !nothingMoved(entry);
  const value = paymentValue(entry);
  const fee = fees.get(entry.paymentHash);
  const reason = refusalReasonOf(entry.reason);
  const identity = identifiedPayeeOf(entry);
  const title = tapTitle(entry, t);
  const declared = declaredName(entry);
  // Its declared name (a node's alias) is the title: the mark beside it. A node, a row of its own:
  // its declared name as well, after the mark, else its key shortened (payee-label.ts).
  const named = identity !== null && declared !== null;
  const rows: DetailRow[] = [
    {
      icon: "calendar-day",
      label: t("cards.history.detail.date"),
      value: format.dateTime(Math.floor(entry.at / 1000))
    },
    ...(identity?.by === "node"
      ? [
          {
            icon: "store" as const,
            label: t("cards.history.detail.merchant"),
            value: (
              <View style={styles.markLine} accessible testID="card-history-merchant">
                <PayeeMark kind="node" />
                <Text style={styles.rowText}>{declared ?? nodeName(identity.id, t)}</Text>
              </View>
            )
          }
        ]
      : []),
    ...(entry.outcome === "declined" || entry.outcome === "failed"
      ? [
          {
            icon: "circle-info" as const,
            label: t("cards.history.detail.motive"),
            value: reason
              ? t(`cards.history.motives.${reason}`)
              : t(
                  entry.outcome === "failed"
                    ? "cards.history.detail.failedMotive"
                    : "cards.history.detail.refusedMotive"
                )
          }
        ]
      : []),
    ...(value ? [valueRow(value, entry.amountSats, t)] : []),
    ...(entry.description && entry.description !== title
      ? [{ icon: "pen" as const, label: t("cards.history.detail.note"), value: entry.description }]
      : []),
    ...(entry.outcome === "sent" && fee !== undefined
      ? [
          {
            icon: "coins" as const,
            label: t("cards.history.detail.fees"),
            value: fee === 0n ? t("cards.history.detail.noFee") : satsText(fee, languageTag)
          }
        ]
      : [])
  ];
  return (
    <View style={styles.content} testID="card-history-tap">
      <View style={styles.head}>
        <Figure
          sign={moved ? "−" : ""}
          sats={entry.amountSats}
          value={value}
          color={moved ? colors.text.primary : colors.text.tertiary}
          struck={!moved}
        />
        {named && identity ? (
          <View style={styles.markLine} accessible>
            <PayeeMark kind={identity.by} />
            <Text style={styles.name}>{title}</Text>
          </View>
        ) : (
          <Text style={styles.name}>{title}</Text>
        )}
        <TapPill entry={entry} />
      </View>
      <Rows rows={rows} />
      {entry.outcome === "declined" ? <Approval entry={entry} /> : null}
    </View>
  );
}

/** What became of a payment, under its name. */
function TapPill({ entry }: { entry: CardPaymentEntry }) {
  const { t } = useTranslation();
  let pill: {
    state: "settled" | "canceled" | "underpaid" | "draft";
    label: string;
    sign?: "check" | "ban";
  };
  switch (entry.outcome) {
    case "sent":
      pill = {
        state: "settled",
        label: entry.payee
          ? t("cards.history.detail.paidWith", {
              payee: t(`cards.history.detail.payee.${entry.payee.status}`)
            })
          : t("cards.history.detail.paid"),
        sign: "check"
      };
      break;
    case "declined":
      pill = { state: "canceled", label: t("cards.history.detail.refusedPill"), sign: "ban" };
      break;
    case "failed":
      pill = { state: "canceled", label: t("cards.history.detail.failedPill"), sign: "ban" };
      break;
    case "uncertain":
      pill = { state: "underpaid", label: t("cards.history.detail.uncertainPill") };
      break;
    case "sending":
      pill = { state: "draft", label: t("cards.history.detail.sendingPill") };
      break;
  }
  return (
    <StatusPillBox whole>
      <StatusPill state={pill.state} label={pill.label} sign={pill.sign} size="sm" />
    </StatusPillBox>
  );
}

/** A merchant identified by its address or its node (identifiedPayeeOf). */
type Identity = { by: "address" | "node"; id: string; name: string | null };

/** The merchant a refused payment would have paid, when identified and not approved then. */
function identityOf(entry: CardPaymentEntry): Identity | null {
  return entry.payee?.status === "new" ? identifiedPayeeOf(entry) : null;
}

type ApprovalState =
  | { phase: "reading" }
  /** Nothing to offer: not identified, approved already, or a card that asks every payment. */
  | { phase: "none" }
  /**
   * It bears the name of a merchant approved for the card, with another address: never approved
   * from here, where nothing tells the two apart (its address is never shown); when a payment
   * there is confirmed, the payment sheet says so (CardPaymentSheet.tsx) where it can be checked.
   */
  | { phase: "homonym" }
  | { phase: "offered"; payee: Identity }
  | { phase: "approving"; payee: Identity }
  /** Approved, on this phone at once; `pending`: no majority of the relays took it yet. */
  | { phase: "approved"; pending: boolean }
  /** The web app: kept in the page only, no majority of the relays took it (lost once it closes). */
  | { phase: "unsaved"; id: string }
  /** The web app: published again ("Try again"). */
  | { phase: "publishing"; id: string };

/** Whether a majority of the relays took the latest change of the merchant (payees-sync.ts). */
function published(books: CardPayeeBooks, card: CardWalletOf, id: string): boolean {
  return !bookOf(books, card).unpublished.has(id);
}

/**
 * "Approve this merchant" under a refused payment: an identified merchant (its proof names its
 * address, never shown; else its invoice's node, which may be shared, as said above the button),
 * not approved for the card yet nor bearing an approved one's name, the card paying approved
 * merchants without asking. The passkey first; then the book of the card's wallet that refused
 * it, published to the relays (payees-sync.ts): said done once kept where it decides, the phone's
 * book on a phone, a majority of the relays on the web app (which keeps nothing of its own).
 */
function Approval({ entry }: { entry: CardPaymentEntry }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { cardId, walletGeneration } = entry;
  const { notify } = useNotifications();
  const walletId = getAccountWalletId();
  const onWeb = Platform.OS === "web";
  const [state, setState] = useState<ApprovalState>(() =>
    identityOf(entry) && walletId ? { phase: "reading" } : { phase: "none" }
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const identity = identityOf(entry);
    if (!identity || !walletId) return;
    let current = true;
    // The phone's book decides its payments; the web app keeps nothing: what a majority gave.
    const read = onWeb
      ? syncCardPayees().then(({ books, conclusive }) =>
          !conclusive || books.newerOnRelays ? null : books
        )
      : loadPayeeBooks(walletId).then((books) => (books.newerOnRelays ? null : books));
    read.then(
      (books) => {
        if (!current) return;
        const payees = books ? payeesView(bookOf(books, { cardId, walletGeneration })) : null;
        if (!books || !payees || payees.mode !== "approved") {
          setState({ phase: "none" });
          return;
        }
        const known = payees.approved.some((payee) => payee.id === identity.id);
        setState(
          known
            ? // Approved in this page earlier, no majority took it yet: said again, never done.
              onWeb && !published(books, { cardId, walletGeneration }, identity.id)
              ? { phase: "unsaved", id: identity.id }
              : { phase: "none" }
            : isPayeeHomonym(payees.approved, identity)
              ? { phase: "homonym" }
              : { phase: "offered", payee: identity }
        );
      },
      (reason: unknown) => {
        logFailure("Reading the approved merchants failed", reason);
        if (current) setState({ phase: "none" });
      }
    );
    return () => {
      current = false;
    };
  }, [entry, cardId, walletGeneration, walletId, onWeb]);

  if (state.phase === "reading" || state.phase === "none" || !walletId) return null;
  if (state.phase === "homonym") {
    return (
      <Callout tone="warning" testID="card-history-homonym">
        {t("cards.history.detail.homonym")}
      </Callout>
    );
  }
  const said = () =>
    notify({
      tone: "success",
      title: t("cards.history.detail.approved"),
      key: "card-history-approve"
    });
  // Read again first: another device may have changed the card's book meanwhile.
  const publish = (id: string): Promise<boolean> =>
    syncCardPayees({ fresh: true }).then(
      ({ books }) => published(books, { cardId, walletGeneration }, id),
      (reason: unknown) => {
        logFailure("Publishing the approved merchants failed", reason);
        return false;
      }
    );
  if (state.phase === "approved") {
    return (
      <View style={styles.approval}>
        <Callout tone="success" testID="card-history-approved">
          {t("cards.history.detail.approvedNote")}
        </Callout>
        {state.pending ? (
          <Callout tone="warning" testID="card-history-approve-pending">
            {t("cards.payees.pending.phone")}
          </Callout>
        ) : null}
      </View>
    );
  }
  if (state.phase === "unsaved" || state.phase === "publishing") {
    const { id } = state;
    const retry = () => {
      setState({ phase: "publishing", id });
      void publish(id).then((done) => {
        setState(done ? { phase: "approved", pending: false } : { phase: "unsaved", id });
        if (done) said();
      });
    };
    return (
      <View style={styles.approval}>
        <Callout tone="warning" testID="card-history-approve-unsaved">
          {t("cards.payees.pending.web")}
        </Callout>
        <Button
          variant="secondary"
          loading={state.phase === "publishing"}
          onPress={retry}
          testID="card-history-approve-retry"
        >
          {t("cards.retry")}
        </Button>
      </View>
    );
  }
  const { payee } = state;
  const approve = () => {
    setError(null);
    setState({ phase: "approving", payee });
    // A merchant approved pays without asking: refused past the check of the 12 words, before the
    // passkey (overdue.ts).
    confirmAccountPasskey({ accountWallet: false })
      .then(() => approveCardPayee(walletId, { cardId, walletGeneration }, payee, Date.now()))
      .then(
        () => {
          if (onWeb) {
            // Kept in the page only until a majority of the relays takes it.
            return publish(payee.id).then((done) => {
              setState(
                done ? { phase: "approved", pending: false } : { phase: "unsaved", id: payee.id }
              );
              if (done) said();
            });
          }
          setState({ phase: "approved", pending: false });
          said();
          return publish(payee.id).then((done) => {
            if (!done) setState({ phase: "approved", pending: true });
          });
        },
        (reason: unknown) => {
          setState({ phase: "offered", payee });
          // The passkey's own failures say so; a dismissed prompt says nothing.
          if (
            reason instanceof PasskeyError ||
            reason instanceof OtherAccountError ||
            reason instanceof RecoveryCheckOverdueError
          ) {
            const unlock = toUnlockFailure(reason);
            if (unlock) logFailure("The passkey for approving a merchant failed", reason);
            setError(unlock ? unlockFailureMessage(unlock, t) : null);
            return;
          }
          logFailure("Approving a merchant failed", reason);
          setError(t("cards.history.detail.approveFailed"));
        }
      );
  };
  return (
    <View style={styles.approval}>
      {payee.by === "node" ? (
        <Callout tone="warning" testID="card-history-approve-node">
          {t("card.payee.nodeWarning")}
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="error" testID="card-history-approve-error">
          {error}
        </Callout>
      ) : null}
      <Button
        icon="key"
        loading={state.phase === "approving"}
        onPress={approve}
        testID="card-history-approve"
      >
        {t("cards.history.detail.approve")}
      </Button>
      <Text style={[styles.note, styles.centered]}>{t("cards.history.detail.approveNote")}</Text>
    </View>
  );
}

function MovementDetail({ movement, note }: { movement: CardMovement; note?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const back = movement.kind === "return";
  // What left: a return, a withdrawal (its fee on top, an on-chain one's too).
  const out = movement.kind !== "recharge";
  const feeText =
    movement.feeSats === 0n
      ? t("cards.history.detail.noFee")
      : satsText(movement.feeSats, languageTag);
  const rows: DetailRow[] = [
    {
      icon: "calendar-day",
      label: t("cards.history.detail.date"),
      value: format.dateTime(Math.floor(movement.at / 1000))
    },
    back
      ? {
          icon: "wallet",
          label: t("cards.history.detail.to"),
          value: t("cards.history.detail.mainBalance")
        }
      : out
        ? {
            icon: "wallet",
            label: t("cards.history.detail.to"),
            value: t(`cards.history.means.${movement.way ?? "main"}`)
          }
        : {
            icon: "right-left",
            label: t("cards.history.detail.way"),
            value: t(`cards.history.means.${movement.way ?? "main"}`)
          },
    ...(movement.value ? [valueRow(movement.value, movement.amountSats, t)] : [])
  ];
  if (movement.way === "onchain" && !out) {
    rows.push(
      {
        icon: "download",
        label: t("cards.history.detail.received"),
        value: satsText(movement.amountSats + movement.feeSats, languageTag)
      },
      {
        icon: "coins",
        label: t("cards.history.detail.fees"),
        value:
          movement.feeSats === 0n
            ? t("cards.history.detail.noFee")
            : t("cards.history.detail.feeDeducted", {
                fee: satsText(movement.feeSats, languageTag)
              })
      }
    );
    if (movement.txid) {
      rows.push({
        icon: "link",
        label: t("cards.history.detail.transaction"),
        value: <TransactionValue txid={movement.txid} />
      });
    }
  } else {
    if (movement.txid) {
      // A withdrawal to a Bitcoin address: its transaction, its fee on top.
      rows.push({
        icon: "link",
        label: t("cards.history.detail.transaction"),
        value: <TransactionValue txid={movement.txid} />
      });
    }
    if (movement.description) {
      rows.push({
        icon: "receipt",
        label: t("cards.history.detail.description"),
        value: movement.description
      });
    }
    if (note) rows.push({ icon: "pen", label: t("cards.history.detail.note"), value: note });
    rows.push({ icon: "coins", label: t("cards.history.detail.fees"), value: feeText });
  }
  return (
    <View style={styles.content} testID="card-history-movement">
      <View style={styles.head}>
        <Figure
          sign={out ? "−" : ""}
          sats={movement.amountSats}
          value={movement.value}
          color={out ? colors.text.primary : colors.success.fg}
          struck={false}
        />
      </View>
      <Rows rows={rows} />
    </View>
  );
}

/**
 * A movement the SDK cannot tell (UnidentifiedMovement): its signed amount and its date only, as
 * nothing else of it is known.
 */
function UnidentifiedDetail({ movement }: { movement: UnidentifiedMovement }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const format = useWalletFormat();
  const received = movement.direction === "receive";
  return (
    <View style={styles.content} testID="card-history-unidentified">
      <View style={styles.head}>
        <Figure
          sign={received ? "" : "−"}
          sats={movement.amountSats}
          value={null}
          color={received ? colors.success.fg : colors.text.primary}
          struck={false}
        />
      </View>
      <Rows
        rows={[
          {
            icon: "calendar-day",
            label: t("cards.history.detail.date"),
            value: format.dateTime(Math.floor(movement.at / 1000))
          }
        ]}
      />
    </View>
  );
}

/**
 * A row of the card's v2 history (legacy-history.ts: shown as the card's other movements, without
 * saying where it comes from): its signed amount, its date, its
 * value as its copy kept it (at the v2 server's price then) and now, its note when it had one (what
 * its payer wrote with a recharge…: card-history.ts), as a sattle.me movement's, and its fee as the
 * v2 server counted it, when it had one (a recharge's deducted, a payment's on top). Nothing else is
 * known of it: no merchant, no way.
 */
function LegacyDetail({ row }: { row: LegacyCardRow }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const received = row.kind === "recharge";
  const fee = msatsText(row.feeMsat, languageTag);
  const rows: DetailRow[] = [
    {
      icon: "calendar-day",
      label: t("cards.history.detail.date"),
      value: format.dateTime(row.at)
    },
    ...(row.value ? [valueRow(row.value, row.sats, t)] : []),
    ...(row.note
      ? [{ icon: "pen" as const, label: t("cards.history.detail.note"), value: row.note }]
      : []),
    ...(row.feeMsat > 0n
      ? [
          {
            icon: "coins" as const,
            label: t("cards.history.detail.fees"),
            value: received ? t("cards.history.detail.feeDeducted", { fee }) : fee
          }
        ]
      : [])
  ];
  return (
    <View style={styles.content} testID="card-history-legacy">
      <View style={styles.head}>
        <Figure
          sign={received ? "" : "−"}
          sats={row.sats}
          value={row.value}
          color={received ? colors.success.fg : colors.text.primary}
          struck={false}
        />
        {received ? null : <Text style={styles.name}>{t("cards.history.noName")}</Text>}
      </View>
      <Rows rows={rows} />
    </View>
  );
}

/**
 * An on-chain movement's transaction (a deposit, a withdrawal): its id cut short, to copy, and its
 * page on the explorer the card's wallet reads the chain on: the account's node when it names one
 * (src/lib/breez/chain-node.ts), else mempool.space (txPageUrl).
 */
function TransactionValue({ txid }: { txid: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const node = useAccountSettings()?.bitcoinNode ?? null;
  const id = normalTxid(txid) ?? txid;
  const url = txPageUrl(id, node);
  const copy = () => {
    const fail = () =>
      notify({ tone: "error", title: t("cards.wallet.copyFailed"), key: "card-history-tx" });
    Clipboard.setStringAsync(id).then(
      (copied) =>
        copied
          ? notify({
              tone: "success",
              title: t("cards.history.detail.txCopied"),
              key: "card-history-tx"
            })
          : fail(),
      fail
    );
  };
  return (
    <View style={styles.transaction}>
      <Text numberOfLines={1} style={styles.txid} testID="card-history-txid">
        {`${id.slice(0, 6)}…${id.slice(-6)}`}
      </Text>
      <IconButton
        icon="copy"
        label={t("cards.history.detail.copyTx")}
        onPress={copy}
        size={13}
        color={colors.text.accent}
        testID="card-history-tx-copy"
      />
      {url ? (
        <Pressable
          {...externalLinkProps(url)}
          accessibilityRole="link"
          accessibilityLabel={t("cards.history.detail.openTx", { explorer: explorerName(node) })}
          style={styles.link}
          testID="card-history-tx-link"
        >
          <Icon name="arrow-up-right-from-square" size={13} color={colors.text.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A row: its label after its icon (decorative: its label says it), its value. */
type DetailRow = { icon: IconName; label: string; value: ReactNode };

/** "Value": what `sats` were worth then, as kept, and what they are worth now (ValueLines). */
function valueRow(value: KeptValue, sats: bigint, t: TFunction): DetailRow {
  return {
    icon: "money-bill",
    label: t("cards.history.detail.value"),
    value: <ValueLines value={value} sats={sats} />
  };
}

/**
 * Two lines: the value as it was kept, "At the time of the transaction"
 * (never worked out again; the hour of its rate is not shown), then the same sats at the rate
 * pricing the present, in the currency of the value kept, rounded to the nearest minor unit as it
 * was (history-value.ts). Read (useRate, the point of sale's in its currency) while the panel
 * shows: waiting said so, an outage too, never a value of another hour.
 */
function ValueLines({ value, sats }: { value: KeptValue; sats: bigint }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag, profile, rate } = usePos();
  // The point of sale's own rate when the value is in its currency: no other read of CoinGecko.
  const own = value.currency === profile.currency;
  const other = useRate(own ? null : value.currency);
  const now = own ? rate : other;
  const then = t("cards.history.detail.valueThen", { fiat: valueText(value, languageTag) });
  let current: ReactNode;
  if (now.rate !== undefined) {
    const minor = satsToFiatMinor(sats, value.digits, now.rate);
    current = (
      <Text style={styles.rowText} testID="card-history-value-now">
        {t("cards.history.detail.valueNow", {
          fiat: `${formatSignedFiat(minor, value.digits, languageTag, "")} ${value.currency}`
        })}
      </Text>
    );
  } else if (now.loading) {
    current = (
      <View style={styles.waiting} testID="card-history-value-now">
        <Spinner size={12} />
        <Text style={styles.rowText}>{t("cards.history.detail.valueNowReading")}</Text>
      </View>
    );
  } else {
    current = (
      <Text style={styles.rowText} testID="card-history-value-now">
        {t("cards.history.detail.valueNowUnknown")}
      </Text>
    );
  }
  return (
    <View style={styles.values}>
      <Text style={styles.rowText} testID="card-history-value-then">
        {then}
      </Text>
      {current}
    </View>
  );
}

/**
 * The amount, large: "−" for what left, unsigned in green for what came in, struck through when
 * nothing moved. As the list writes it ("Currency shown first", settings/amount-unit.ts): its value
 * as it was kept
 * first, its sats under it; its sats alone when the sats come first, or without a value (none kept,
 * nothing moved).
 */
function Figure({
  sign,
  sats,
  value,
  color,
  struck
}: {
  sign: "−" | "";
  sats: bigint;
  value: KeptValue | null;
  color: string;
  struck: boolean;
}) {
  const styles = useStyles();
  const { languageTag } = usePos();
  const unit = useAmountUnit();
  if (unit === "fiat" && value !== null && !struck) {
    return (
      <View style={styles.figureBox}>
        <Text style={styles.figureLine} testID="card-history-amount">
          <Text style={[styles.figure, { color }]}>
            {formatSignedFiat(BigInt(value.minor), value.digits, languageTag, sign)}
          </Text>
          <Text style={styles.unit}> {value.currency}</Text>
        </Text>
        <Text style={styles.figureSats} testID="card-history-amount-sats">
          {satsText(sats, languageTag)}
        </Text>
      </View>
    );
  }
  return (
    <Text style={styles.figureLine} testID="card-history-amount">
      <Text style={[styles.figure, { color }, struck && styles.struck]}>
        {`${sign}${formatInteger(sats, languageTag)}`}
      </Text>
      <Text style={[styles.unit, struck && styles.struck]}> sats</Text>
    </Text>
  );
}

function Rows({ rows }: { rows: DetailRow[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.rows}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={[styles.row, index < rows.length - 1 && styles.separated]}
          testID={`card-history-detail-${index}`}
        >
          <View style={styles.labelLine}>
            <Icon name={row.icon} size={13} color={colors.text.secondary} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>{row.label}</Text>
          </View>
          <View style={styles.rowValue}>
            {typeof row.value === "string" ? (
              <Text style={styles.rowText}>{row.value}</Text>
            ) : (
              row.value
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space[6] },
  head: { alignItems: "center", gap: 6 },
  figureBox: { alignItems: "center", gap: 2 },
  figureLine: { textAlign: "center" },
  figureSats: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  figure: {
    ...sans(700),
    fontSize: 40,
    letterSpacing: tracking(AMOUNT_EM, 40),
    fontVariant: ["tabular-nums"]
  },
  unit: { ...sans(600), fontSize: 17, color: colors.text.secondary },
  struck: { textDecorationLine: "line-through", color: colors.text.tertiary },
  name: { ...sans(600), fontSize: 16, textAlign: "center", color: colors.text.primary },
  markLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  rows: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.app,
    paddingVertical: 4,
    paddingHorizontal: 16
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  labelLine: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  // One width for every glyph: the labels start on one line.
  rowIcon: { width: 16, textAlign: "center" },
  rowLabel: { ...sans(500), fontSize: type.prose, color: colors.text.secondary },
  rowValue: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8
  },
  values: { flexShrink: 1, alignItems: "flex-end", gap: 2, paddingVertical: 10 },
  waiting: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowText: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.prose,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  transaction: { flexDirection: "row", alignItems: "center", marginVertical: -6 },
  txid: { ...mono(500), flexShrink: 1, fontSize: type.prose, color: colors.text.primary },
  link: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -12 },
  note: { ...sans(500), fontSize: type.caption, lineHeight: 18, color: colors.text.secondary },
  centered: { textAlign: "center" },
  approval: { gap: space[4] }
}));
