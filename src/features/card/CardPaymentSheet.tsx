import type { TFunction } from "i18next";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CheckBox } from "@/components/ui/CheckBox";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { AutoReturnRing } from "@/features/terminal/AutoReturnRing";
import { usePos } from "@/features/terminal/pos";
import { formatSats } from "@/features/wallet/send/amount";
import { useWalletFormat } from "@/features/wallet/format";
import type { CardInvoice } from "@/lib/card/card-invoice";
import type { CardPayeeView } from "@/lib/card/payee-decision";
import { formatDate } from "@/lib/locale/date";
import { AMOUNT_EM, makeStyles, palette, radius, sans, tracking, useTheme } from "@/theme";

import { cardLabel } from "./card-label";
import { CardMini } from "./CardFaceView";
import { answerDelay } from "./card-notices";
import { nodeName, payeeKindText, payeeName } from "./payee-label";
import { PayeeMark } from "./PayeeMark";
import type { CardPayment, CardPaymentFailure, CardPaymentView, PaidCard } from "./payment";
import { closeCardPayment, currentCardPayment, subscribeCardPayments } from "./payments";

/*
 * "Card payment", the receipt: a tap of the user's card at a point of sale, over whatever the app
 * shows. While the holder is asked: the time left to answer under the title, the amount, who it
 * pays (the name the merchant declared, never its address, and its status), the point of sale's
 * note and the card, then "Approve this merchant" for a new merchant (unticked: their choice),
 * "Pay" (the passkey, then the payment) or "Decline"; past the time, what the point of sale was
 * told. Then the outcome. It cannot be closed while the passkey or the payment runs. Also: an
 * approved merchant's former name and the holder's own name for it, under its name; the failures
 * other than the time run out; the amount in sats only without a rate; the card's row only once its
 * tap is checked (on an iPhone locked, after the passkey). A payment that left pending stays
 * "Sending the payment…" while it is followed, then "Payment made" at once, never "Payment sent" in
 * between (only once it is no longer followed, still pending: never shown paid before the wallet
 * says so); "Payment made" closes itself after AUTO_CLOSE_SECONDS in sight, counted down on "Done"
 * by the point of sale's ring (AutoReturnRing).
 */

const NO_VIEW: CardPaymentView = { phase: "waiting" };
const NOTHING = () => () => undefined;

/** The holder did not answer in time (payment.ts deadlinePassed). */
const LATE: readonly CardPaymentFailure[] = [
  "newPayee",
  "unidentifiedPayee",
  "unconfirmed",
  "late"
];

/** At most this many seconds left, the time shows in the warning's ochre. */
const LOW_SECONDS = 10;

/** "Payment made" closes itself this many seconds after it shows. */
const AUTO_CLOSE_SECONDS = 10;

/** The time left before the panel closes itself; `round` changes each time the count starts. */
type AutoClose = { seconds: number; round: number };

/** The time left to answer: `left` of `total` whole seconds; `late` once past. */
type AnswerTime = { left: number; total: number; late: boolean };

export function CardPaymentSheet() {
  const { t } = useTranslation();
  const payment = useSyncExternalStore(subscribeCardPayments, currentCardPayment, () => null);
  const view = useSyncExternalStore(
    payment ? (listener) => payment.subscribe(listener) : NOTHING,
    () => payment?.getView() ?? NO_VIEW,
    () => NO_VIEW
  );
  const time = useAnswerTime(view);
  const busy = view.phase === "confirming" || view.phase === "paying";
  return (
    <Sheet
      title={t("card.payment.title")}
      subtitle={
        time === null
          ? undefined
          : time.late
            ? t("card.payment.timeOut")
            : t("card.payment.answerIn", { seconds: time.left })
      }
      subtitleTone={
        time === null
          ? "secondary"
          : time.late
            ? "danger"
            : time.left <= LOW_SECONDS
              ? "warning"
              : "secondary"
      }
      closeLabel={t("card.payment.close")}
      visible={payment !== null}
      onClose={() => {
        if (payment) closeCardPayment(payment);
      }}
      dismissible={!busy}
      testID="card-payment"
    >
      {/* One content per payment: a next one (a newer tap, or the next once one is closed) shows in
          the same panel, and must never inherit the previous one's "Approve this merchant". */}
      {payment ? <Content key={payment.session} payment={payment} view={view} time={time} /> : null}
    </Sheet>
  );
}

/**
 * The seconds left to answer while the holder is asked, counted from the payment's deadline (the
 * device's clock, as the payment's); "Time is up" once the payment ended for the time run
 * out. Null otherwise: nothing is timed. From the view only: the payment changes in place.
 */
function useAnswerTime(view: CardPaymentView): AnswerTime | null {
  const deadline = view.phase === "ready" ? view.deadline : null;
  const windowMs = view.phase === "ready" || view.phase === "failed" ? view.answerMs : null;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      // When the whole seconds change next.
      if (ms > 0) timer = setTimeout(tick, ms % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [deadline]);
  const total = Math.max(1, Math.round((windowMs ?? 0) / 1000));
  if (view.phase === "failed" && LATE.includes(view.failure) && view.invoice) {
    return { left: 0, total, late: true };
  }
  if (deadline === null || left === null) return null;
  return { left, total, late: false };
}

/**
 * While `active`, the whole seconds left before `payment`'s panel closes itself, on the device's
 * clock, and which count it is (a new ring for each); null otherwise. Counted only while the app
 * is in sight: a payment completed with the app in the background (Android runs it) waits for the
 * holder, and gets its whole time again each time the app comes back (as useCardWakes, only
 * "background" is out of sight).
 */
function useAutoClose(active: boolean, payment: CardPayment): AutoClose | null {
  const [left, setLeft] = useState(AUTO_CLOSE_SECONDS);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hidden = AppState.currentState === "background";
    const start = () => {
      const end = Date.now() + AUTO_CLOSE_SECONDS * 1000;
      setRound((r) => r + 1);
      const tick = () => {
        const ms = end - Date.now();
        if (ms <= 0) {
          closeCardPayment(payment);
          return;
        }
        setLeft(Math.ceil(ms / 1000));
        // When the whole seconds change next.
        timer = setTimeout(tick, ms % 1000 || 1000);
      };
      tick();
    };
    if (!hidden) start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        hidden = true;
        clearTimeout(timer);
        setLeft(AUTO_CLOSE_SECONDS);
      } else if (hidden) {
        hidden = false;
        start();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [active, payment]);
  return active ? { seconds: left, round } : null;
}

function Content({
  payment,
  view,
  time
}: {
  payment: CardPayment;
  view: CardPaymentView;
  time: AnswerTime | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [approve, setApprove] = useState(false);
  const close = () => closeCardPayment(payment);
  const delay = answerDelay(view.phase === "failed" ? view.answerMs : null, t);
  const closesIn = useAutoClose(view.phase === "sent" && view.status === "completed", payment);
  switch (view.phase) {
    case "waiting":
      return <Waiting label={t("card.payment.waiting")} testID="card-payment-waiting" />;
    case "checking":
      return (
        <View style={styles.content}>
          <Amount invoice={view.invoice} extra={view.invoice.description} desktop={desktop} />
          <Waiting label={t("card.payment.checking")} testID="card-payment-checking" />
        </View>
      );
    case "ready":
      return (
        <Panel
          top={time ? <TimeBar time={time} /> : null}
          footer={
            <View style={styles.actions}>
              <PayButton
                invoice={view.invoice}
                onPress={() => void payment.pay({ approve })}
                desktop={desktop}
              />
              <Button
                variant="secondary"
                size={desktop ? "md" : "lg"}
                fullWidth={!desktop}
                onPress={() => payment.decline()}
                testID="card-payment-decline"
              >
                {t("card.payment.decline")}
              </Button>
            </View>
          }
        >
          <Amount invoice={view.invoice} desktop={desktop} />
          <Details>
            <PayeeRow payee={view.payee} />
            {view.invoice.description ? <NoteRow note={view.invoice.description} /> : null}
            {view.card ? <CardRow card={view.card} /> : null}
          </Details>
          <Homonym payee={view.payee} />
          {/* Approving a node approves whoever it receives for (payee-proof.ts), said before the
              holder chooses: above the box, in sight whenever the box is (the receipt scrolls from
              its top). */}
          {view.approvable && view.payee.by === "node" ? (
            <Callout tone="warning" testID="card-payment-node-warning">
              {t("card.payee.nodeWarning")}
            </Callout>
          ) : null}
          {view.approvable ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: approve }}
              accessibilityLabel={`${t("card.payment.approve")}, ${t("card.payment.approveCaption")}`}
              onPress={() => setApprove(!approve)}
              style={styles.approve}
              testID="card-payment-approve"
            >
              <CheckBox checked={approve} size="lg" />
              <View style={styles.approveTexts}>
                <Text style={styles.approveTitle}>{t("card.payment.approve")}</Text>
                <Text style={styles.approveCaption}>{t("card.payment.approveCaption")}</Text>
              </View>
            </Pressable>
          ) : null}
          <Text style={styles.note} testID="card-payment-ask">
            {t(`card.payment.note.${view.cause}`)}
          </Text>
        </Panel>
      );
    case "confirming":
    case "paying":
      return (
        <Busy
          view={view}
          label={view.phase === "confirming" ? t("card.payment.confirming") : payingText(view, t)}
          testID={`card-payment-${view.phase}`}
          desktop={desktop}
        />
      );
    case "sent":
      if (view.status === "pending" && view.following) {
        // Left, not yet completed: still being sent, as far as the holder is told.
        return (
          <Busy
            view={view}
            label={payingText(view, t)}
            testID="card-payment-paying"
            desktop={desktop}
          />
        );
      }
      return (
        <Panel footer={<Done desktop={desktop} onPress={close} autoClose={closesIn} />}>
          <Outcome status={view.status} automatic={view.automatic} invoice={view.invoice} />
          <Details>
            <NameRow payee={view.payee} />
            <Row label={t("card.payment.exactAmount")} testID="card-payment-exact">
              <Sats sats={view.invoice.amountSats} />
            </Row>
            {view.card ? <CardRow card={view.card} /> : null}
          </Details>
          {view.approved ? (
            <View style={styles.approved} testID="card-payment-approved">
              <Icon name="store" size={12} color={colors.success.fg} style={styles.approvedIcon} />
              <Text style={styles.approvedText}>{t("card.payment.approved")}</Text>
            </View>
          ) : null}
        </Panel>
      );
    case "declined":
      return (
        <Panel footer={<Done desktop={desktop} onPress={close} />}>
          <Outcome status="declined" automatic={false} invoice={view.invoice} />
          <Details>
            <NameRow payee={view.payee} />
            {view.card ? <CardRow card={view.card} /> : null}
          </Details>
        </Panel>
      );
    case "failed":
      if (time && view.invoice) {
        // The time ran out: the receipt as it was, what the point of sale was told under it.
        return (
          <Panel top={<TimeBar time={time} />} footer={<Done desktop={desktop} onPress={close} />}>
            <Amount invoice={view.invoice} desktop={desktop} />
            <Details>
              {view.payee ? <PayeeRow payee={view.payee} /> : null}
              {view.invoice.description ? <NoteRow note={view.invoice.description} /> : null}
              {view.card ? <CardRow card={view.card} /> : null}
            </Details>
            {view.payee ? <Homonym payee={view.payee} /> : null}
            <Callout tone="error" icon="clock-regular" testID="card-payment-failure">
              {view.failure === "newPayee" && view.payee?.homonym
                ? t("card.payment.failure.newPayeeHomonym", { delay })
                : t(`card.payment.failure.${view.failure}`, { delay })}
            </Callout>
          </Panel>
        );
      }
      return (
        <Panel footer={<Done desktop={desktop} onPress={close} />}>
          {view.invoice ? <Amount invoice={view.invoice} desktop={desktop} /> : null}
          {view.payee ? (
            <Details>
              <NameRow payee={view.payee} />
              {view.card ? <CardRow card={view.card} /> : null}
            </Details>
          ) : null}
          <Callout tone="error" title={t("card.payment.failedTitle")} testID="card-payment-failure">
            {view.failure === "unlock" && view.unlock
              ? `${unlockFailureMessage(view.unlock, t)} ${t("card.payment.nothingPaid")}`
              : t(`card.payment.failure.${view.failure}`, { delay })}
          </Callout>
        </Panel>
      );
  }
}

/**
 * A phase with buttons: `children` scroll within the room the sheet leaves them (at most 85 % of
 * the screen: a new merchant's receipt with its warnings, large text sizes), `footer` stays in
 * sight under them, never pushed off the screen ("Pay" and "Decline" stay in reach under a
 * merchant's node warning). `top` stays above them (the time bar).
 */
function Panel({
  top = null,
  footer,
  children
}: {
  top?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.panel}>
      {top}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        // A receipt that fits does not rubber-band (iOS bounces by default even then).
        alwaysBounceVertical={false}
        testID="card-payment-scroll"
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** While the passkey or the payment runs: the amount, who and which card, what runs. */
function Busy({
  view,
  label,
  testID,
  desktop
}: {
  view: { invoice: CardInvoice; payee: CardPayeeView; card: PaidCard | null };
  label: string;
  testID: string;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.content}>
      <Amount
        invoice={view.invoice}
        extra={payeeCardLine(view.payee, view.card, t)}
        desktop={desktop}
        busy
      />
      <Waiting label={label} testID={testID} />
    </View>
  );
}

/** "Sending the payment…", "without confirmation" when paid without asking. */
function payingText(view: { automatic: boolean }, t: TFunction): string {
  return view.automatic ? t("card.payment.payingAutomatically") : t("card.payment.paying");
}

/** "Lakeside Coffee · card Daily": who it pays, then the card once its tap is checked. */
function payeeCardLine(payee: CardPayeeView, card: PaidCard | null, t: TFunction): string {
  const name = payeeName(payee, t);
  if (card === null) return name;
  return t("card.payment.joined", {
    first: name,
    second: card.name ? t("card.payment.ofCard", { name: card.name }) : cardLabel(card, t)
  });
}

/** The amount in sats, in the device locale's grouping. */
function Sats({ sats }: { sats: bigint }) {
  const styles = useStyles();
  const { languageTag } = usePos();
  return <Text style={styles.value}>{formatSats(sats, languageTag)}</Text>;
}

function Waiting({ label, testID }: { label: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.waiting} accessibilityLiveRegion="polite" testID={testID}>
      <Spinner size={28} />
      <Text style={styles.waitingText}>{label}</Text>
    </View>
  );
}

/** The time left to answer, as a bar under the panel's header ("Time to answer"). */
function TimeBar({ time }: { time: AnswerTime }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const width = `${Math.round((time.left / time.total) * 100)}%` as const;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t("card.payment.timeLabel")}
      accessibilityValue={{ min: 0, max: time.total, now: time.left }}
      style={styles.track}
      testID="card-payment-time"
    >
      <View
        style={[
          styles.bar,
          {
            width,
            backgroundColor: time.left <= LOW_SECONDS ? colors.warning.solid : palette.orange
          }
        ]}
      />
    </View>
  );
}

/**
 * The amount: in the account's currency at the current rate, its sats under it, then `extra` (the
 * point of sale's note; while it is paid, who and which card); the sats alone without a rate.
 * `busy`: the sats left out ("Lakeside Coffee · card Daily" alone).
 */
function Amount({
  invoice,
  extra = null,
  desktop,
  busy = false
}: {
  invoice: CardInvoice;
  extra?: string | null;
  desktop: boolean;
  busy?: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const fiat = format.fiat(invoice.amountSats);
  const sats = formatSats(invoice.amountSats, languageTag);
  const under =
    fiat === null || busy
      ? extra
      : extra
        ? t("card.payment.joined", { first: sats, second: extra })
        : sats;
  return (
    <View style={styles.amount} testID="card-payment-invoice">
      <Text style={[styles.big, desktop && styles.bigDesktop]} testID="card-payment-amount">
        {fiat ?? sats}
      </Text>
      {under ? (
        <Text style={styles.small} testID="card-payment-amount-line">
          {under}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The receipt's rows, a line between two of them, none after the last. Each child must render: a
 * row left out is left out here (`null`), never by a component of its own returning null, which
 * would leave a line where nothing follows. Without any row, no box (the time run out before the
 * payee was known, without a note nor a card).
 */
function Details({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  return (
    <View style={styles.details} testID="card-payment-details">
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) ? row.key : index}>
          {index > 0 ? <View style={styles.divider} testID="card-payment-divider" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

function Row({
  label,
  children,
  a11y,
  testID
}: {
  label: string;
  children: ReactNode;
  /** What screen readers read of the row, when its texts alone say less. */
  a11y?: string;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel={a11y} style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

/** A tone of the theme's colours: its fill and its ink. */
type Tone = "success" | "warning" | "danger";

/** Its status's chip: its tone and its mark. */
const CHIPS = {
  approved: { tone: "success", icon: "check" },
  new: { tone: "warning", icon: "store" },
  unidentified: { tone: "danger", icon: "triangle-exclamation" },
  unchecked: { tone: "warning", icon: "triangle-exclamation" }
} as const satisfies Record<CardPayeeView["status"], { tone: Tone; icon: IconName }>;

/** "Approved on 15 Oct 2026", "New merchant"… (the chip's words). */
function chipText(payee: CardPayeeView, t: TFunction, languageTag: string): string {
  switch (payee.status) {
    case "approved":
      return payee.approvedAt === null
        ? t("card.payee.chip.approvedUndated")
        : t("card.payee.chip.approved", {
            date: formatDate(new Date(payee.approvedAt), languageTag, { dateStyle: "medium" })
          });
    case "new":
      return t("card.payee.chip.new");
    case "unidentified":
      return t("card.payee.chip.unidentified");
    case "unchecked":
      return t("card.payee.chip.unchecked");
  }
}

/**
 * Who the payment pays: the name the merchant declared ("Unknown name"
 * without one; its node's, shortened, for a node), never its address, how it is identified, and
 * its status; an approved merchant's former name and the holder's own name for it under it.
 */
function PayeeRow({ payee }: { payee: CardPayeeView }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const name = payeeName(payee, t);
  const chip = chipText(payee, t, languageTag);
  const { icon } = CHIPS[payee.status];
  const tone = colors[CHIPS[payee.status].tone];
  const said = [
    payee.name === null
      ? name
      : t(payee.by === "node" ? "card.payee.declaredByNode" : "card.payee.declaredName", { name }),
    // A node's alias names it, its key tells it apart.
    payee.node !== null && payee.name !== null ? nodeName(payee.node, t) : null,
    payee.by === null ? null : payeeKindText(payee.by, t),
    chip,
    payee.formerName === null ? null : t("card.payee.formerName", { name: payee.formerName }),
    payee.localName === null ? null : t("card.payee.localName", { name: payee.localName })
  ];
  return (
    <Row
      label={t("card.payment.merchant")}
      a11y={`${t("card.payment.merchant")}, ${said.filter(Boolean).join(", ")}`}
      testID="card-payment-payee"
    >
      <NameLine payee={payee} name={name} style={styles.payeeName} />
      <View style={[styles.chip, { backgroundColor: tone.bg }]} testID="card-payment-payee-status">
        <Icon name={icon} size={10} color={tone.fg} />
        <Text style={[styles.chipText, { color: tone.fg }]}>{chip}</Text>
      </View>
      {payee.node !== null && payee.name !== null ? (
        <Text style={styles.aside} testID="card-payment-payee-node">
          {nodeName(payee.node, t)}
        </Text>
      ) : null}
      {payee.formerName !== null ? (
        <Text style={styles.aside} testID="card-payment-payee-former">
          {t("card.payee.formerName", { name: payee.formerName })}
        </Text>
      ) : null}
      {payee.localName !== null ? (
        <Text style={styles.aside}>{t("card.payee.localName", { name: payee.localName })}</Text>
      ) : null}
    </Row>
  );
}

/** Who it paid, its name alone (the outcome's rows). */
function NameRow({ payee }: { payee: CardPayeeView }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Row label={t("card.payment.merchant")} testID="card-payment-payee">
      <NameLine payee={payee} name={payeeName(payee, t)} style={styles.value} />
    </Row>
  );
}

/** Its name, after the mark of how it is identified (none when it is not). */
function NameLine({
  payee,
  name,
  style
}: {
  payee: CardPayeeView;
  name: string;
  style: ReturnType<typeof useStyles>["value"];
}) {
  const styles = useStyles();
  return (
    <View style={styles.nameLine}>
      {payee.by === null ? null : <PayeeMark kind={payee.by} />}
      <Text style={[style, styles.nameText]} testID="card-payment-payee-name">
        {name}
      </Text>
    </View>
  );
}

/** The point of sale's note, when its invoice has one (its words, as it sent them). */
function NoteRow({ note }: { note: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Row label={t("card.payment.noteLabel")} testID="card-payment-note">
      <Text style={styles.value}>{note}</Text>
    </Row>
  );
}

/** The card, once its tap is checked: never one it might be. */
function CardRow({ card }: { card: PaidCard }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Row label={t("card.payment.card")} testID="card-payment-card">
      <View style={styles.card}>
        <CardMini card={card} />
        <Text style={styles.value}>{cardLabel(card, t)}</Text>
      </View>
    </Row>
  );
}

function Homonym({ payee }: { payee: CardPayeeView }) {
  const { t } = useTranslation();
  if (!payee.homonym) return null;
  return (
    <Callout tone="warning" testID="card-payment-homonym">
      {t("card.payee.homonym")}
    </Callout>
  );
}

/** "CHF 12.50" at the current rate, else its sats. */
function useAmountWords(sats: bigint): string {
  const { languageTag } = usePos();
  const format = useWalletFormat();
  return format.fiat(sats) ?? formatSats(sats, languageTag);
}

function PayButton({
  invoice,
  onPress,
  desktop
}: {
  invoice: CardInvoice;
  onPress: () => void;
  desktop: boolean;
}) {
  const { t } = useTranslation();
  const amount = useAmountWords(invoice.amountSats);
  return (
    <Button
      icon="key"
      size={desktop ? "md" : "lg"}
      fullWidth={!desktop}
      onPress={onPress}
      testID="card-payment-pay"
    >
      {t("card.payment.pay", { amount })}
    </Button>
  );
}

const OUTCOMES = {
  completed: { tone: "success", icon: "circle-check" },
  pending: { tone: "warning", icon: "clock-regular" },
  failed: { tone: "danger", icon: "circle-exclamation" },
  declined: { tone: "warning", icon: "circle-exclamation" }
} as const satisfies Record<string, { tone: Tone; icon: IconName }>;

/** The payment's outcome ("Payment made", "Payment declined"). */
function Outcome({
  status,
  automatic,
  invoice
}: {
  status: keyof typeof OUTCOMES;
  automatic: boolean;
  invoice: CardInvoice;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const amount = useAmountWords(invoice.amountSats);
  const { icon } = OUTCOMES[status];
  const tone = colors[OUTCOMES[status].tone];
  return (
    <View
      style={[styles.result, { backgroundColor: tone.bg }]}
      accessibilityLiveRegion="polite"
      testID={`card-payment-${status}`}
    >
      <Icon name={icon} size={22} color={tone.fg} style={styles.resultIcon} />
      <View style={styles.resultText}>
        <Text style={[styles.resultTitle, { color: tone.fg }]}>
          {t(`card.payment.result.${status}Title`)}
        </Text>
        <Text style={[styles.resultBody, { color: tone.fg }]}>
          {status === "completed" && automatic
            ? t("card.payment.result.completedBodyAutomatic", { amount })
            : t(`card.payment.result.${status}Body`, { amount })}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Done", with the ring of the seconds before the panel closes itself when it does (`autoClose`),
 * as the point of sale's "Back to the Point of Sale". Screen readers, which skip
 * the ring, hear the seconds in its name.
 */
function Done({
  desktop,
  onPress,
  autoClose = null
}: {
  desktop: boolean;
  onPress: () => void;
  autoClose?: AutoClose | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={desktop ? styles.actionsDesktop : null}>
      <Button
        size={desktop ? "md" : "lg"}
        fullWidth={!desktop}
        onPress={onPress}
        accessibilityLabel={
          autoClose === null ? undefined : t("card.payment.doneIn", { seconds: autoClose.seconds })
        }
        accessory={
          autoClose === null
            ? undefined
            : (color) => (
                // A new ring each time the count starts again (back in sight: its whole time).
                <AutoReturnRing
                  key={autoClose.round}
                  durationMs={AUTO_CLOSE_SECONDS * 1000}
                  secondsLeft={autoClose.seconds}
                  color={color}
                />
              )
        }
        testID="card-payment-done"
      >
        {t("card.payment.done")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: 14 },
  // Shrinks to the sheet's room: its scroll view takes what is left by the bar and the buttons.
  panel: { flexShrink: 1, gap: 14 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  // Under the header, as close to it as can be.
  track: {
    height: 4,
    marginTop: -6,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  bar: { height: "100%", borderRadius: radius.pill },
  amount: { alignItems: "center", gap: 2, paddingTop: 2 },
  big: {
    ...sans(700),
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  bigDesktop: { fontSize: 40, letterSpacing: tracking(AMOUNT_EM, 40) },
  small: {
    ...sans(600),
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary,
    textAlign: "center"
  },
  details: {
    borderRadius: 18,
    backgroundColor: colors.background.app,
    paddingVertical: 4,
    paddingHorizontal: 16
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
    paddingVertical: 11
  },
  divider: { height: 1, backgroundColor: colors.border.subtle },
  rowValue: { flexShrink: 1, alignItems: "flex-end", gap: 5 },
  label: { flexShrink: 0, ...sans(500), fontSize: 13.5, color: colors.text.secondary },
  value: { ...sans(600), fontSize: 14, textAlign: "right", color: colors.text.primary },
  payeeName: { ...sans(600), fontSize: 14.5, textAlign: "right", color: colors.text.primary },
  nameLine: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  nameText: { flexShrink: 1 },
  aside: { ...sans(500), fontSize: 12, textAlign: "right", color: colors.text.secondary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.pill
  },
  chipText: { ...sans(600), fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 8 },
  approve: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingVertical: 4,
    paddingHorizontal: 2
  },
  approveTexts: { flex: 1, gap: 1 },
  approveTitle: { ...sans(600), fontSize: 14.5, color: colors.text.primary },
  approveCaption: { ...sans(500), fontSize: 12.5, color: colors.text.secondary },
  note: { ...sans(500), fontSize: 13, lineHeight: 19, color: colors.text.secondary },
  actions: { gap: 10 },
  actionsDesktop: { flexDirection: "row", justifyContent: "flex-end" },
  waiting: { alignItems: "center", gap: 14, paddingTop: 18, paddingBottom: 24 },
  waitingText: {
    maxWidth: 300,
    ...sans(600),
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: "center",
    color: colors.text.secondary
  },
  approved: { flexDirection: "row", gap: 8 },
  approvedIcon: { marginTop: 3 },
  approvedText: {
    flex: 1,
    ...sans(500),
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary
  },
  result: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    padding: 16
  },
  resultIcon: { width: 28 },
  resultText: { flex: 1, gap: 4 },
  resultTitle: { ...sans(700), fontSize: 15 },
  resultBody: { ...sans(500), fontSize: 14, lineHeight: 20 }
}));
