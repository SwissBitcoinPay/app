import * as Clipboard from "expo-clipboard";
import type { TFunction } from "i18next";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { SatsAmount } from "@/components/ui/AmountBlock";
import { Button } from "@/components/ui/Button";
import { formatClock } from "@/components/ui/Countdown";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SHEET_GAP, Sheet } from "@/components/ui/Sheet";
import { SheetPages } from "@/components/ui/sheet-pages";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { UnitSwitch } from "@/components/ui/UnitSwitch";
import { unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { usePos } from "@/features/terminal/pos";
import { holdActivity } from "@/lib/activity";
import type { SendDestination } from "@/lib/breez/types";
import { logFailure } from "@/lib/log/log";
import { formatFiat, formatSatsGrouped } from "@/lib/terminal/amount";
import {
  AMOUNT_EM,
  makeStyles,
  mono,
  proseLineHeight,
  sans,
  space,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { useWalletFormat, type WalletFormat } from "../format";
import { fiatPlaceholder, formatSats } from "./amount";
import { Scanner, canScan } from "./Scanner";
import { SendWaiting } from "./SendWaiting";
import { SpeedControl } from "./SpeedControl";
import { useSend, type SendSource, type SendState } from "./useSend";

/** Between the blocks of the sheet's content. */
const CONTENT_GAP = 18;

/**
 * The field's glyph for the kind read: @ for an address, the bitcoin mark on-chain; a Spark
 * address, the arrows of a Spark transfer in the activity.
 */
const KIND_ICONS: Record<SendDestination["kind"], IconName> = {
  lightningAddress: "at",
  lnurlPay: "bolt",
  bolt11: "file-invoice",
  bitcoinAddress: "bitcoin",
  sparkAddress: "right-left"
};

/**
 * "Send" of the wallet screen: a bottom sheet on mobile, a centred dialog on desktop. The recipient
 * alone first; once read, the form adapts to its kind: amount and fees for a Lightning address, the
 * invoice's amount read for a Lightning invoice, the speed too for a Bitcoin address. The passkey
 * is asked at "Send", then the sheet stays until the payment's outcome.
 */
export function SendSheet({
  visible,
  onClose,
  balanceSats,
  onSent
}: {
  visible: boolean;
  onClose: () => void;
  balanceSats: bigint;
  /** A payment left (or may have): the wallet's balance and list are read again. */
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  // Kept here, not in the content: the sheet must not close while a payment is being sent.
  const [locked, setLocked] = useState(false);
  return (
    <Sheet
      title={t("wallet.send")}
      closeLabel={t("wallet.sendSheet.close")}
      visible={visible}
      onClose={onClose}
      dismissible={!locked}
      dialogWidth={560}
      testID="send-sheet"
    >
      <SendForm
        desktop={desktop}
        balanceSats={balanceSats}
        onSent={onSent}
        onClose={onClose}
        onLock={setLocked}
      />
    </Sheet>
  );
}

/**
 * "Send"'s content, in its sheet, or in another panel: a card's "Withdraw" (CardWalletFlow.tsx),
 * from the card's wallet (`source`), with `aside` under the field while no recipient is read ("To
 * my main balance"), and `readAside` under "Send" once one is read and the form is still being
 * filled ("Empty the card", to that recipient). `underTitle`: right under a sheet's title, its
 * intro as a subtitle. `initialRecipient`: the recipient of a form shown again, read at once.
 */
export function SendForm({
  desktop,
  balanceSats,
  onSent,
  onClose,
  onLock,
  source,
  aside = null,
  readAside,
  underTitle = true,
  initialRecipient
}: {
  desktop: boolean;
  balanceSats: bigint;
  onSent: () => void;
  onClose: () => void;
  onLock: (locked: boolean) => void;
  /** The wallet the payment leaves: the account's by default (useSend). */
  source?: SendSource;
  aside?: ReactNode;
  readAside?: (read: { destination: SendDestination; recipientText: string }) => ReactNode;
  underTitle?: boolean;
  initialRecipient?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const format = useWalletFormat();
  const send = useSend({ balanceSats, onSent, source, initialRecipient });
  const [scanning, setScanning] = useState(false);
  const [pasteError, setPasteError] = useState<"pasteEmpty" | "pasteFailed" | null>(null);
  const busy = send.phase === "confirming" || send.phase === "sending";
  // The sheet cannot be closed while the passkey or the payment runs.
  useEffect(() => {
    onLock(busy);
  }, [busy, onLock]);
  // Nor can the auto-lock close it: the passkey's prompt takes no touch of the app, however long
  // it stays open (another device's passkey), and the payment's outcome would be lost.
  useEffect(() => {
    if (!busy) return;
    return holdActivity();
  }, [busy]);

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
    send.changeRecipient(text.trim(), "now");
  };

  // The form, its scanner, its outcome: one fades into the other, this form's state kept (Sheet's
  // pages).
  if (send.phase === "done" && send.sent) {
    return (
      <SheetPages page="result">
        <Result send={send} format={format} desktop={desktop} onClose={onClose} />
      </SheetPages>
    );
  }

  if (scanning) {
    return (
      <SheetPages page="scan">
        <Scanner
          onScanned={(data) => {
            setScanning(false);
            send.changeRecipient(data, "now");
          }}
          onCancel={() => setScanning(false)}
        />
      </SheetPages>
    );
  }

  const { recipient, destination } = send;
  const recipientError = pasteError
    ? t(`wallet.sendSheet.recipientErrors.${pasteError}`)
    : recipient.state === "invalid"
      ? t(`wallet.sendSheet.recipientErrors.${recipient.code}`)
      : send.expired
        ? t("wallet.sendSheet.recipientErrors.expired")
        : null;

  return (
    <SheetPages page="form">
      <ScrollView
        // With the intro, the scroll view itself is pulled up under the title: pulling up the intro
        // inside it would clip its first line. The intro still scrolls away, for large text sizes.
        style={[styles.scroll, destination || !underTitle ? null : styles.scrollUnderTitle]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {destination ? null : (
          <Text style={styles.intro} testID="send-intro">
            {canScan ? t("wallet.sendSheet.intro") : t("wallet.sendSheet.introNoScan")}
          </Text>
        )}
        <View style={styles.recipient}>
          <TextField
            label={t("wallet.sendSheet.recipient")}
            placeholder={t("wallet.sendSheet.recipientPlaceholder")}
            value={send.recipientText}
            // Disabled while the passkey or the payment runs: the outcome names this recipient.
            disabled={busy}
            onChangeText={
              busy
                ? undefined
                : (text) => {
                    setPasteError(null);
                    send.changeRecipient(text);
                  }
            }
            icon={destination ? KIND_ICONS[destination.kind] : undefined}
            error={recipientError}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            trailing={
              busy ? null : (
                <RecipientTools
                  onPaste={() => void paste()}
                  onScan={() => {
                    setPasteError(null);
                    setScanning(true);
                  }}
                  testID="send"
                />
              )
            }
            testID="send-recipient"
          />
          <RecipientStatus send={send} />
        </View>

        {destination ? (
          <Form send={send} format={format} desktop={desktop} />
        ) : aside !== null ? (
          <View style={desktop ? styles.asideDesktop : null}>{aside}</View>
        ) : null}

        {destination ? (
          <Actions send={send} format={format} desktop={desktop} onClose={onClose} />
        ) : null}
        {destination && readAside && send.phase === "edit" ? (
          <View style={desktop ? styles.asideDesktop : null}>
            {readAside({ destination, recipientText: send.recipientText })}
          </View>
        ) : null}
      </ScrollView>
    </SheetPages>
  );
}

/**
 * In the recipient's field: "Paste" and "Scan", icons only (no button under the field), the
 * scanner's where a camera can scan. `testID`: the form's prefix (`<prefix>-paste`,
 * `<prefix>-scan`). Also CardDrain's.
 */
export function RecipientTools({
  onPaste,
  onScan,
  testID
}: {
  onPaste: () => void;
  onScan: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.tools}>
      <IconButton
        icon="paste"
        label={t("wallet.sendSheet.paste")}
        size={16}
        color={colors.text.accent}
        style={canScan ? undefined : styles.toolLast}
        onPress={onPaste}
        testID={`${testID}-paste`}
      />
      {canScan ? (
        <IconButton
          icon="qrcode"
          label={t("wallet.sendSheet.scan")}
          size={16}
          color={colors.text.accent}
          style={styles.toolLast}
          onPress={onScan}
          testID={`${testID}-scan`}
        />
      ) : null}
    </View>
  );
}

/** Under the field: the kind read, with its check, or the read in progress. */
function RecipientStatus({ send }: { send: SendState }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  if (send.recipient.state === "reading") {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Spinner size={13} />
        <Text style={styles.statusReading}>{t("wallet.sendSheet.reading")}</Text>
      </View>
    );
  }
  if (!send.destination || send.expired) return null;
  return (
    <View style={styles.status} testID="send-kind">
      <Icon name="circle-check" size={12} color={colors.success.fg} />
      <Text style={styles.statusRead}>{t(`wallet.sendSheet.kinds.${send.destination.kind}`)}</Text>
    </View>
  );
}

/** The form for the kind read: the invoice's amount, else the amount to send. */
function Form({
  send,
  format,
  desktop
}: {
  send: SendState;
  format: WalletFormat;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag, profile } = usePos();
  const destination = send.destination;
  if (!destination) return null;
  const locked = send.phase !== "edit";
  const fixedInvoice = destination.kind === "bolt11" && destination.amountSats !== null;
  // A balance in the unit being typed (in francs for an invoice of its own amount), to compare
  // it with the amount at a glance: francs rounded down, as francs typed become sats rounded up
  // (fiatToSats), so that typing the figure shown never goes above the balance. Only in the
  // currency of the francs typed: another display currency would relabel them (useSend).
  const balanceWords = (sats: bigint): string =>
    (fixedInvoice || (send.unit === "fiat" && send.fiatCurrency === profile.currency)
      ? format.fiat(sats, "", "down")
      : null) ?? formatSats(sats, languageTag);
  const balanceAfter =
    desktop && send.balanceAfterSats !== null && send.amountIssue === null
      ? balanceWords(send.balanceAfterSats)
      : null;

  return (
    <View style={styles.form}>
      {fixedInvoice && destination.amountSats !== null ? (
        <View style={styles.invoice} testID="send-invoice">
          {destination.description ? (
            <Text style={styles.invoiceDescription}>{destination.description}</Text>
          ) : null}
          {format.fiat(destination.amountSats) !== null ? (
            <Text style={[styles.invoiceFiat, desktop && styles.invoiceFiatDesktop]}>
              {format.fiat(destination.amountSats)}
            </Text>
          ) : null}
          <View style={styles.invoiceSats}>
            <SatsAmount value={formatSatsGrouped(destination.amountSats)} size={16} />
          </View>
        </View>
      ) : (
        <View style={styles.amount}>
          <TextField
            label={t("wallet.sendSheet.amount")}
            value={send.amountText}
            disabled={locked}
            onChangeText={locked ? undefined : send.setAmountText}
            placeholder={send.unit === "fiat" ? fiatPlaceholder(send.fiatDigits, languageTag) : "0"}
            keyboardType={send.unit === "fiat" ? "decimal-pad" : "number-pad"}
            inputMode={send.unit === "fiat" ? "decimal" : "numeric"}
            error={amountError(send, t, languageTag)}
            trailing={
              <UnitSwitch
                unit={send.unit === "fiat" ? send.fiatCurrency : "sats"}
                label={
                  send.unit === "fiat"
                    ? t("wallet.sendSheet.switchToSats")
                    : t("wallet.sendSheet.switchToFiat", { currency: send.fiatCurrency })
                }
                enabled={send.canSwitchUnit && !locked}
                onPress={send.switchUnit}
                testID="send-unit"
              />
            }
            testID="send-amount"
          />
          <View style={styles.amountSub}>
            <Equivalent send={send} format={format} />
            <Text style={styles.caption} numberOfLines={1} testID="send-available">
              {t("wallet.sendSheet.available", { amount: balanceWords(send.balanceSats) })}
            </Text>
          </View>
        </View>
      )}

      {destination.kind === "bitcoinAddress" ? (
        <View style={styles.speed}>
          <Text style={styles.fieldLabel}>{t("wallet.sendSheet.speed")}</Text>
          <SpeedControl
            value={send.speed}
            onChange={send.setSpeed}
            locked={locked}
            testID="send-speed"
          />
        </View>
      ) : null}

      <View>
        {destination.kind === "bolt11" ? (
          <Row label={t("wallet.sendSheet.expiresIn")}>
            <Text style={styles.clock}>{formatClock(send.secondsLeft)}</Text>
          </Row>
        ) : null}
        <Row label={t("wallet.sendSheet.fee")}>
          {send.feeSats !== null ? (
            <SatsAmount value={formatSatsGrouped(send.feeSats)} size={13.5} showIcon={false} />
          ) : send.quote.state === "preparing" ? (
            <Text style={styles.rowPending}>{t("wallet.sendSheet.feePreparing")}</Text>
          ) : (
            <Text style={styles.rowPending}>—</Text>
          )}
        </Row>
        {balanceAfter !== null ? (
          <Row label={t("wallet.sendSheet.balanceAfter")}>
            <Text style={styles.rowValue} testID="send-balance-after">
              {balanceAfter}
            </Text>
          </Row>
        ) : null}
      </View>
      {send.quote.state === "failed" ? (
        <View style={styles.quoteFailed}>
          <ErrorMessage>{t("wallet.sendSheet.quoteFailed")}</ErrorMessage>
          {/* Nothing else would prepare it again for an invoice of its own amount: no field. */}
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={send.retryQuote}
            testID="send-quote-retry"
          >
            {t("wallet.retry")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** The amount in the other unit, under the field: sats under francs, francs under sats. */
function Equivalent({ send, format }: { send: SendState; format: WalletFormat }) {
  const styles = useStyles();
  if (send.requestedSats === null) return <View />;
  if (send.unit === "fiat") {
    return (
      <SatsAmount value={formatSatsGrouped(send.requestedSats)} size={12.5} showIcon={false} />
    );
  }
  const fiat = format.fiat(send.requestedSats);
  return fiat !== null ? <Text style={styles.caption}>{fiat}</Text> : <View />;
}

function amountError(send: SendState, t: TFunction, languageTag: string): string | null {
  const issue = send.amountIssue;
  if (!issue) return null;
  switch (issue.kind) {
    case "belowMin":
      return t("wallet.sendSheet.amountErrors.belowMin", {
        amount: formatSats(issue.sats, languageTag)
      });
    case "aboveMax":
      return t("wallet.sendSheet.amountErrors.aboveMax", {
        amount: formatSats(issue.sats, languageTag)
      });
    default:
      return t(`wallet.sendSheet.amountErrors.${issue.kind}`);
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * The amount as the form shows it: an invoice's in francs (else sats), the francs typed, or the
 * sats typed. Null while there is none.
 */
function useAmountWords(send: SendState, format: WalletFormat): string | null {
  const { languageTag } = usePos();
  const destination = send.destination;
  if (destination?.kind === "bolt11" && destination.amountSats !== null) {
    return format.fiat(destination.amountSats) ?? formatSats(destination.amountSats, languageTag);
  }
  // In the currency they were typed in, whatever the display currency is now (useSend).
  if (send.unit === "fiat" && send.typedFiatMinor !== null && send.typedFiatMinor > 0) {
    return `${formatFiat(send.typedFiatMinor, send.fiatDigits, languageTag)} ${send.fiatCurrency}`;
  }
  if (send.unit === "sats" && send.requestedSats !== null && send.requestedSats > 0n) {
    return formatSats(send.requestedSats, languageTag);
  }
  return null;
}

/** What the button names: "Pay 23.70 CHF" for an invoice, else "Send 142.20 CHF". */
function useAmountLabel(send: SendState, format: WalletFormat): string {
  const { t } = useTranslation();
  const amount = useAmountWords(send, format);
  if (amount === null) return t("wallet.send");
  const fixed = send.destination?.kind === "bolt11" && send.destination.amountSats !== null;
  return fixed ? t("wallet.sendSheet.pay", { amount }) : t("wallet.sendSheet.send", { amount });
}

/** The failure of the last attempt, then "Send": alone on mobile, after "Cancel" on desktop. */
function Actions({
  send,
  format,
  desktop,
  onClose
}: {
  send: SendState;
  format: WalletFormat;
  desktop: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const label = useAmountLabel(send, format);
  const failure = send.failure;
  const message =
    failure?.kind === "passkey"
      ? unlockFailureMessage(failure.failure, t)
      : failure?.kind === "noRate"
        ? t("wallet.sendSheet.noRate")
        : failure?.kind === "record"
          ? t("wallet.sendSheet.recordFailed")
          : failure?.kind === "send"
            ? t("wallet.sendSheet.sendFailed")
            : null;

  const waiting =
    send.phase === "confirming" || send.phase === "sending" ? (
      <SendWaiting phase={send.phase} testID="send-waiting" />
    ) : null;

  const primary = (
    <Button
      icon="paper-plane"
      size={desktop ? "md" : "lg"}
      fullWidth={!desktop}
      style={desktop ? styles.sendDesktop : undefined}
      disabled={!send.canSend}
      onPress={() => void send.send()}
      testID="send-confirm"
    >
      {label}
    </Button>
  );

  return (
    <View style={styles.actions}>
      {message ? <ErrorMessage testID="send-failure">{message}</ErrorMessage> : null}
      {waiting ??
        (desktop ? (
          <View style={styles.actionsDesktop}>
            <Button
              variant="secondary"
              size="md"
              fullWidth={false}
              style={styles.cancelDesktop}
              onPress={onClose}
            >
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

/** The outcome's disc: the spinner's ring around a smaller disc while the payment is pending. */
const RESULT_DISC = 84;
const RESULT_RING = 3;
const RESULT_INNER = 66;

/**
 * The payment's outcome: a disc, the state, the amount and its recipient, then a note. The same
 * frame for every outcome, so that a pending payment turning completed or failed changes only its
 * disc, its title, its note and its button. Pending, the spinner turns around the disc while the
 * payment is followed (useSend); once it is no longer followed, the ring stops and the note says
 * where its outcome will show. Sent (completed, on-chain), the point of sale's paid disc: tinted,
 * a check. Nothing is finished while it is pending: "Close", not the filled "Done".
 */
function Result({
  send,
  format,
  desktop,
  onClose
}: {
  send: SendState;
  format: WalletFormat;
  desktop: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const amount = useAmountWords(send, format);
  const destination = send.destination;
  const outcome = outcomeOf(send.sent?.status ?? "pending", destination);
  const stalled = outcome === "pending" && send.followEnded;
  const sent = outcome === "completed" || outcome === "onchain";
  const recipient = destination ? recipientName(destination) : "";
  const recipientLine =
    recipient === ""
      ? t("wallet.sendSheet.kinds.bolt11")
      : t(sent ? "wallet.sendSheet.result.recipientSent" : "wallet.sendSheet.result.recipientTo", {
          recipient
        });
  const title = t(`wallet.sendSheet.result.${stalled ? "stalled" : outcome}Title`);
  const note =
    outcome === "completed"
      ? null
      : t(`wallet.sendSheet.result.${stalled ? "stalled" : outcome}Body`);
  const titleColor = sent
    ? colors.success.fg
    : outcome === "failed"
      ? colors.danger.fg
      : colors.text.primary;

  let disc: ReactNode;
  if (outcome === "pending") {
    disc = (
      // The same view in every outcome, its background and testID changing while the sheet shows:
      // never flattened, as Android crashed when that changed in a sheet (OverlayModal).
      <View
        collapsable={false}
        style={styles.resultDisc}
        testID={stalled ? "send-result-stalled" : undefined}
      >
        {stalled ? (
          <View
            collapsable={false}
            style={[styles.resultRing, { borderColor: colors.border.subtle }]}
          />
        ) : (
          <View collapsable={false} style={styles.resultRingBox} testID="send-result-following">
            <Spinner size={RESULT_DISC} thickness={RESULT_RING} />
          </View>
        )}
        <View
          collapsable={false}
          style={[
            styles.resultInner,
            {
              backgroundColor: stalled ? colors.background.subtle : colors.background.accentSubtle
            }
          ]}
        >
          <Icon
            name={
              stalled
                ? "clock-regular"
                : destination?.kind === "sparkAddress"
                  ? "right-left"
                  : "bolt"
            }
            size={28}
            color={stalled ? colors.text.secondary : colors.text.accent}
          />
        </View>
      </View>
    );
  } else {
    const tone = sent ? colors.success : colors.danger;
    disc = (
      <View
        collapsable={false}
        style={[styles.resultDisc, styles.resultFull, { backgroundColor: tone.bg }]}
      >
        <Icon name={sent ? "check" : "xmark"} size={34} color={tone.fg} />
      </View>
    );
  }

  return (
    <View style={styles.content} testID={`send-result-${outcome}`}>
      <View style={styles.result}>
        {disc}
        <View style={styles.resultText} accessibilityLiveRegion="polite">
          <Text style={[styles.resultTitle, { color: titleColor }]}>{title}</Text>
          {amount ? <Text style={styles.resultAmount}>{amount}</Text> : null}
          <Text style={styles.resultRecipient}>{recipientLine}</Text>
          {note ? <Text style={styles.resultNote}>{note}</Text> : null}
        </View>
      </View>
      {outcome === "pending" ? (
        <Button
          variant="secondary"
          size={desktop ? "md" : "lg"}
          fullWidth
          onPress={onClose}
          testID="send-done"
        >
          {t("wallet.sendSheet.close")}
        </Button>
      ) : (
        <Button size={desktop ? "md" : "lg"} fullWidth onPress={onClose} testID="send-done">
          {t("wallet.sendSheet.result.done")}
        </Button>
      )}
    </View>
  );
}

/**
 * What the outcome says of a payment the SDK returned, read again while it was pending. A Bitcoin
 * address's is "onchain", sent, whether the SDK reads it pending or completed: spark-sdk 0.28.4
 * returns a withdrawal only once Spark's provider took its payout on
 * (spark/src/services/coop_exit.rs, `request_payout`: `CoopExitAcceptance::Accepted`, else an
 * error); its pending is the transfer to the provider not settled yet
 * (breez-sdk/core/src/models/adaptors.rs). Neither proves the transaction confirmed (Accepted holds
 * from `CompleteRequestReceived` on): the network's confirmation is said as still to come. A
 * failure read later still shows as one. Elsewhere (Lightning, Spark), a pending payment is still
 * on its way and may yet fail: "Payment in progress".
 */
type SendOutcome = "completed" | "onchain" | "pending" | "failed";

function outcomeOf(
  status: "completed" | "pending" | "failed",
  destination: SendDestination | null
): SendOutcome {
  if (status === "failed") return "failed";
  return destination?.kind === "bitcoinAddress" ? "onchain" : status;
}

/** Who was paid, for the outcome: the address, the LNURL's domain, the invoice's description. */
function recipientName(destination: SendDestination): string {
  switch (destination.kind) {
    case "lightningAddress":
      return destination.address;
    case "lnurlPay":
      return destination.domain;
    case "bolt11":
      return destination.description ?? "";
    case "bitcoinAddress":
    case "sparkAddress": {
      const { address } = destination;
      return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
    }
  }
}

const useStyles = makeStyles(({ colors }) => ({
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The intro, its first child, 2 px under the sheet's header (SHEET_GAP below it), as a subtitle
  // of the title; the content's gap then comes before the field.
  scrollUnderTitle: { marginTop: space[1] - SHEET_GAP },
  content: { gap: CONTENT_GAP },
  intro: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  recipient: { gap: 8 },
  // The last icon's 44 px target overhangs the field's padding, its glyph where the QR's was.
  tools: { flexDirection: "row", alignItems: "center" },
  toolLast: { marginRight: -12 },
  status: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 4, minHeight: 18 },
  statusRead: { ...sans(600), fontSize: type.fieldLabel, color: colors.success.fg },
  statusReading: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  asideDesktop: { flexDirection: "row" },
  form: { gap: CONTENT_GAP },
  quoteFailed: { gap: 12, alignItems: "flex-start" },
  amount: { gap: 8 },
  amountSub: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    minHeight: 18
  },
  caption: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  speed: { gap: 9 },
  fieldLabel: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  invoice: { gap: 2 },
  invoiceDescription: {
    ...sans(600),
    fontSize: 15,
    color: colors.text.primary
  },
  invoiceFiat: {
    ...sans(700),
    marginTop: 14,
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  invoiceFiatDesktop: { fontSize: 40, letterSpacing: tracking(AMOUNT_EM, 40), lineHeight: 40 },
  invoiceSats: { marginTop: 9, flexDirection: "row" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle
  },
  rowLabel: { ...sans(500), fontSize: 13.5, color: colors.text.secondary },
  rowValue: {
    ...sans(600),
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  rowPending: { ...sans(500), fontSize: 13.5, color: colors.text.secondary },
  clock: { ...mono(700), fontSize: 14.5, color: colors.text.primary },
  actions: { gap: 14 },
  actionsDesktop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 12 },
  cancelDesktop: { minWidth: 150 },
  sendDesktop: { minWidth: 250 },
  // The disc 12 px under the header, then the text centred under it.
  result: { alignItems: "center", paddingTop: 12, paddingHorizontal: 8 },
  resultDisc: {
    width: RESULT_DISC,
    height: RESULT_DISC,
    alignItems: "center",
    justifyContent: "center"
  },
  resultFull: { borderRadius: RESULT_DISC / 2 },
  resultRingBox: { position: "absolute", left: 0, top: 0 },
  resultRing: {
    position: "absolute",
    left: 0,
    top: 0,
    width: RESULT_DISC,
    height: RESULT_DISC,
    borderRadius: RESULT_DISC / 2,
    borderWidth: RESULT_RING
  },
  resultInner: {
    width: RESULT_INNER,
    height: RESULT_INNER,
    borderRadius: RESULT_INNER / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  resultText: { alignSelf: "stretch", alignItems: "center", marginTop: 20 },
  resultTitle: {
    ...sans(700),
    fontSize: 17,
    letterSpacing: tracked.label,
    textAlign: "center"
  },
  resultAmount: {
    ...sans(700),
    marginTop: 10,
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    color: colors.text.primary
  },
  resultRecipient: {
    ...sans(600),
    marginTop: 10,
    fontSize: 14.5,
    textAlign: "center",
    color: colors.text.secondary
  },
  resultNote: {
    ...sans(500),
    marginTop: 22,
    maxWidth: 360,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    textAlign: "center",
    color: colors.text.secondary
  }
}));
