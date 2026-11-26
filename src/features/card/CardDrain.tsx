import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { SheetPages } from "@/components/ui/sheet-pages";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { formatSats } from "@/features/wallet/send/amount";
import { Scanner, canScan } from "@/features/wallet/send/Scanner";
import { RecipientTools } from "@/features/wallet/send/SendSheet";
import { SendWaiting } from "@/features/wallet/send/SendWaiting";
import { SpeedControl } from "@/features/wallet/send/SpeedControl";
import type { SendSource } from "@/features/wallet/send/useSend";
import { logFailure } from "@/lib/log/log";
import { makeStyles, proseLineHeight, sans, space, type } from "@/theme";

import { useDrain, type DrainState } from "./useDrain";

/**
 * "Empty the card" of a card holder's card, built as "Send": the recipient (typed, pasted or
 * scanned: a Lightning address or a Bitcoin address), then what the card holds, the fees and what
 * the recipient gets, exactly, the speed on-chain; "Empty the card" asks the passkey, then its
 * outcome. `onBusy`: the panel must not close while it is sent; `onDone(changed)`: it closes, the
 * balance read again when it may have changed. `initialRecipient`: the recipient read in
 * "Withdraw", where "Empty the card" shows once a recipient is read, read again here at once.
 * `subject`: what is emptied, whose words it says: a card's wallet, or the account's own wallet
 * ("Open with my 12 words", src/features/rescue/), sent the same way.
 */
export function CardDrain({
  source,
  readBalance,
  desktop,
  onBusy,
  onDone,
  initialRecipient,
  subject = "card"
}: {
  source: SendSource;
  readBalance: () => Promise<bigint>;
  desktop: boolean;
  onBusy: (busy: boolean) => void;
  onDone: (changed: boolean) => void;
  initialRecipient?: string;
  subject?: DrainSubject;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const text = useDrainText(subject);
  const [changed, setChanged] = useState(false);
  const drain = useDrain({
    source,
    readBalance,
    onSent: () => setChanged(true),
    initialRecipient
  });
  const [scanning, setScanning] = useState(false);
  const [pasteError, setPasteError] = useState<"pasteEmpty" | "pasteFailed" | null>(null);
  const busy = drain.phase === "confirming" || drain.phase === "sending";
  // The panel cannot close while the passkey or the payment runs; never left busy once gone.
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);

  // The form, its scanner, its outcome: one fades into the other, this form's state kept (Sheet's
  // pages).
  if (drain.phase === "done" && drain.sent) {
    return (
      <SheetPages page="outcome">
        <Outcome drain={drain} desktop={desktop} onDone={() => onDone(true)} subject={subject} />
      </SheetPages>
    );
  }
  if (scanning) {
    return (
      <SheetPages page="scan">
        <Scanner
          onScanned={(data) => {
            setScanning(false);
            drain.changeRecipient(data, "now");
          }}
          onCancel={() => setScanning(false)}
        />
      </SheetPages>
    );
  }

  const paste = async () => {
    setPasteError(null);
    let text: string;
    try {
      text = await Clipboard.getStringAsync();
    } catch (error) {
      logFailure("Reading the clipboard failed", error);
      setPasteError("pasteFailed");
      return;
    }
    if (!text.trim()) {
      setPasteError("pasteEmpty");
      return;
    }
    drain.changeRecipient(text.trim(), "now");
  };

  const { recipient } = drain;
  const recipientError = pasteError
    ? t(`wallet.sendSheet.recipientErrors.${pasteError}`)
    : recipient.state === "invalid"
      ? recipient.code === "invoice"
        ? t("cards.drain.invoice")
        : t(`wallet.sendSheet.recipientErrors.${recipient.code}`)
      : null;

  return (
    <SheetPages page="form">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="card-drain"
      >
        {drain.destination ? null : (
          <Text style={styles.intro}>{text(canScan ? "intro" : "introNoScan")}</Text>
        )}
        <TextField
          label={t("wallet.sendSheet.recipient")}
          placeholder={t("cards.drain.placeholder")}
          value={drain.recipientText}
          disabled={busy}
          onChangeText={
            busy
              ? undefined
              : (text) => {
                  setPasteError(null);
                  drain.changeRecipient(text);
                }
          }
          error={recipientError}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          trailing={
            busy ? null : (
              <RecipientTools
                onPaste={() => void paste()}
                onScan={() => {
                  setPasteError(null);
                  setScanning(true);
                }}
                testID="card-drain"
              />
            )
          }
          testID="card-drain-recipient"
        />
        {recipient.state === "reading" ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <Spinner size={13} />
            <Text style={styles.statusText}>{t("wallet.sendSheet.reading")}</Text>
          </View>
        ) : null}
        {drain.destination ? <Figures drain={drain} subject={subject} /> : null}
        {drain.destination ? (
          <Actions
            drain={drain}
            desktop={desktop}
            onCancel={() => onDone(changed)}
            subject={subject}
          />
        ) : null}
      </ScrollView>
    </SheetPages>
  );
}

/**
 * What the card holds, the fees, what the recipient gets; the speed on-chain. Each row in fiat with
 * its exact sats beneath: each fiat value is rounded on its own, so CHF 0.60 less a fee of 3 sats
 * can read CHF 0.59, which only the sats show exactly.
 */
function Figures({ drain, subject }: { drain: DrainState; subject: DrainSubject }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const text = useDrainText(subject);
  const figure = useFigure();
  const { quote } = drain;
  if (quote.state === "none") return null;
  if (quote.state === "preparing") {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite" testID="card-drain-preparing">
        <Spinner size={13} />
        <Text style={styles.statusText}>{t("wallet.sendSheet.feePreparing")}</Text>
      </View>
    );
  }
  if (quote.state === "failed") {
    return (
      <View style={styles.failed}>
        <ErrorMessage testID="card-drain-quote-failed">
          {quote.empty ? text("empty") : t("cards.drain.quoteFailed")}
        </ErrorMessage>
        {quote.empty ? null : (
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={drain.retry}
            testID="card-drain-retry"
          >
            {t("wallet.retry")}
          </Button>
        )}
      </View>
    );
  }
  const { fees, totalSats } = quote.quote;
  const feeSats = fees.onchain ? fees.bySpeed[drain.speed] : fees.feeSats;
  // Sending, or an attempt made at the speed chosen (its retry sends that very payment).
  const locked = drain.phase !== "edit" || drain.speedLocked;
  return (
    <View style={styles.figures}>
      {fees.onchain ? (
        <View style={styles.speed}>
          <Text style={styles.label}>{t("wallet.sendSheet.speed")}</Text>
          <SpeedControl
            value={drain.speed}
            onChange={drain.setSpeed}
            locked={locked}
            testID="card-drain-speed"
          />
        </View>
      ) : null}
      <View>
        <Row label={text("total")} figure={figure(totalSats)} testID="card-drain-total" />
        <Row label={t("wallet.sendSheet.fee")} figure={figure(feeSats)} testID="card-drain-fee" />
        <Row
          label={t("cards.drain.received")}
          figure={drain.receivedSats !== null ? figure(drain.receivedSats) : { value: "—" }}
          strong
          testID="card-drain-received"
        />
      </View>
      {drain.receivedSats === null ? (
        // The fee of this speed takes it all: another speed, or nothing to send.
        <ErrorMessage testID="card-drain-fees-above">{text("feesAbove")}</ErrorMessage>
      ) : null}
    </View>
  );
}

/** The failure of the last attempt, then "Empty the card": after "Cancel" on desktop. */
function Actions({
  drain,
  desktop,
  onCancel,
  subject
}: {
  drain: DrainState;
  desktop: boolean;
  onCancel: () => void;
  subject: DrainSubject;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const text = useDrainText(subject);
  const failure = drain.failure;
  const message =
    failure?.kind === "passkey"
      ? unlockFailureMessage(failure.failure, t)
      : failure?.kind === "record"
        ? t("wallet.sendSheet.recordFailed")
        : failure?.kind === "send"
          ? t("wallet.sendSheet.sendFailed")
          : null;
  const waiting =
    drain.phase === "confirming" || drain.phase === "sending" ? (
      <SendWaiting phase={drain.phase} testID="card-drain-waiting" />
    ) : null;
  const primary = (
    <Button
      icon="arrow-up"
      size={desktop ? "md" : "lg"}
      fullWidth={!desktop}
      disabled={!drain.canSend}
      onPress={drain.send}
      testID="card-drain-confirm"
    >
      {text("confirm")}
    </Button>
  );
  return (
    <View style={styles.actions}>
      {message ? <ErrorMessage testID="card-drain-failure">{message}</ErrorMessage> : null}
      {waiting ??
        (desktop ? (
          <View style={styles.actionsDesktop}>
            <Button variant="secondary" size="md" fullWidth={false} onPress={onCancel}>
              {t("wallet.sendSheet.cancel")}
            </Button>
            {primary}
          </View>
        ) : (
          primary
        ))}
    </View>
  );
}

/** What the SDK says of the payment, never more: left (completed or pending), or failed. */
function Outcome({
  drain,
  desktop,
  onDone,
  subject
}: {
  drain: DrainState;
  desktop: boolean;
  onDone: () => void;
  subject: DrainSubject;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const text = useDrainText(subject);
  const amount = useAmount();
  const sent = drain.sent;
  if (!sent) return null;
  const words = amount(sent.receivedSats);
  const { status } = sent.payment;
  return (
    <View style={styles.content} testID="card-drain-done">
      <Callout
        tone={status === "completed" ? "success" : status === "failed" ? "error" : "warning"}
        testID="card-drain-outcome"
      >
        {status === "completed"
          ? text("done", words)
          : status === "failed"
            ? text("failed")
            : text("pending", words)}
      </Callout>
      <Button
        size={desktop ? "md" : "lg"}
        fullWidth={!desktop}
        onPress={onDone}
        testID="card-drain-finish"
      >
        {t("cards.sheet.done")}
      </Button>
    </View>
  );
}

/** What is emptied: a card's wallet, or the account's own (the rescue's). */
export type DrainSubject = "card" | "wallet";

type DrainTextKey =
  | "intro"
  | "introNoScan"
  | "total"
  | "feesAbove"
  | "empty"
  | "confirm"
  | "done"
  | "pending"
  | "failed";

/** The panel's words for `subject`: "the card", or "the wallet". */
function useDrainText(subject: DrainSubject): (key: DrainTextKey, amount?: string) => string {
  const { t } = useTranslation();
  return (key, amount) => {
    if (subject === "wallet") return t(`rescue.drain.${key}`, { amount });
    return key === "confirm" ? t("cards.wallet.emptyCard") : t(`cards.drain.${key}`, { amount });
  };
}

/** Sats as the card's panel shows them: in the display currency, else in sats. */
function useAmount(): (sats: bigint) => string {
  const format = useWalletFormat();
  const { languageTag } = usePos();
  return (sats) => format.fiat(sats) ?? formatSats(sats, languageTag);
}

/** A row's value: in francs with its exact sats, else in sats alone (no rate). */
type Figure = { value: string; sats?: string };

function useFigure(): (sats: bigint) => Figure {
  const format = useWalletFormat();
  const { languageTag } = usePos();
  return (sats) => {
    const exact = formatSats(sats, languageTag);
    const fiat = format.fiat(sats);
    return fiat === null ? { value: exact } : { value: fiat, sats: exact };
  };
}

function Row({
  label,
  figure,
  strong = false,
  testID
}: {
  label: string;
  figure: Figure;
  strong?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowFigure}>
        <Text style={[styles.rowValue, strong && styles.rowStrong]}>{figure.value}</Text>
        {figure.sats !== undefined ? <Text style={styles.rowSats}>{figure.sats}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 18, paddingBottom: space[2] },
  intro: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  figures: { gap: 14 },
  speed: { gap: 8 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  failed: { gap: 10, alignItems: "flex-start" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8
  },
  rowLabel: { ...sans(500), flexShrink: 1, fontSize: type.body, color: colors.text.secondary },
  rowFigure: { alignItems: "flex-end" },
  rowValue: { ...sans(600), fontSize: type.body, color: colors.text.primary },
  rowSats: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  rowStrong: { ...sans(700) },
  actions: { gap: 12 },
  actionsDesktop: { flexDirection: "row", justifyContent: "flex-end", gap: 12 }
}));
