import type { TFunction } from "i18next";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { OtherAccountError } from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { RecoveryCheckOverdueError, openAccountOverdue } from "@/features/recovery-check/overdue";
import { PasskeyError } from "@/lib/breez/errors";
import { cardLimitUsage, type CardLimitUsage } from "@/lib/card/card-limits";
import type { CardState } from "@/lib/card/card-record";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import { loadCardPayments, type CardPaymentEntry } from "@/lib/card/payment-log";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { makeStyles, palette, proseLineHeight, radius, sans, space, type, useTheme } from "@/theme";

import { RowIcon } from "./CardRows";
import { readCardHistory } from "./history-sync";
import { CARD_LIMIT_MAX, changeCardLimit, type CardLimit } from "./manage";
import { withCardAccess } from "./states";

/*
 * "Limits" of a card: what the card spent over 24 sliding hours and in the last hour against its
 * limits, when the first payments leave the windows, its ceiling per payment; each opens its form,
 * which asks the passkey for any change, raised or lowered. The gauges count this phone's payments,
 * as the limits do (card-limits.ts); the web app, which pays nothing, counts the card's payments
 * the account's relays keep, and shows none that no majority of the relays gave.
 */

/** How often the windows are worked out again while "Limits" shows: they slide on their own. */
const TICK_MS = 30_000;
/** Above this many payments an hour, a bar in place of one segment per payment. */
const MAX_SEGMENTS = 12;

/** The payments the card's limits count, as read. */
export type LimitLog =
  | { phase: "reading" }
  /** The phone's log unreadable, or no majority of the relays gave the card's payments (web). */
  | { phase: "unread" }
  | { phase: "ready"; log: readonly CardPaymentEntry[] };

/** The payments a card's limits count as read (useCardLimitLog), the time they are counted at. */
export type CardLimitRead = { log: LimitLog; now: number; retry: () => void };

/**
 * The payments the card's limits count, and the time they are counted at: the phone's log, read
 * again at each tick (a payment made meanwhile counts at once); in the web app, what a majority of
 * the relays hold of the card's, read once. Both are read again once `again` changes ("Cards": the
 * card's balance moved, its panel opened), what was read shown meanwhile; `retry` reads them again,
 * shown as being read. Read once for "Cards"'s "Limits" and its panel (CardsScreen.tsx). No card:
 * nothing read, no tick.
 */
export function useCardLimitLog(card: CardWalletOf | null, again = 0): CardLimitRead {
  const cardId = card?.cardId ?? null;
  const walletGeneration = card?.walletGeneration ?? null;
  const of = card ? `${card.cardId}:${card.walletGeneration}` : null;
  const [now, setNow] = useState(() => Date.now());
  const [round, setRound] = useState(0);
  // Whose payments, read at which round: never another card's, nor what a retry reads again.
  const [read, setRead] = useState<{ of: string; round: number; log: LimitLog } | null>(null);
  const onWeb = Platform.OS === "web";
  // Ticks while a card is read only; its time taken again as it starts (a card shown again after a
  // while, its windows counted at once from now).
  const ticks = of !== null;
  useEffect(() => {
    if (!ticks) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [ticks]);
  const tick = onWeb ? 0 : now;
  useEffect(() => {
    if (cardId === null || walletGeneration === null || of === null) return;
    let current = true;
    const show = (log: LimitLog) => {
      if (current) setRead({ of, round, log });
    };
    const unread = (error: unknown) => {
      logFailure("Reading the card payments failed", error);
      show({ phase: "unread" });
    };
    if (onWeb) {
      withCardAccess((access) => readCardHistory(access)).then(
        (history) =>
          // A newer app's records left out: their payments would be missing from the sums.
          show(
            history.conclusive && !history.newer
              ? {
                  phase: "ready",
                  log: history.entries.filter((entry) =>
                    sameCardWallet(entry, { cardId, walletGeneration })
                  )
                }
              : { phase: "unread" }
          ),
        unread
      );
    } else {
      loadCardPayments().then((log) => show({ phase: "ready", log }), unread);
    }
    return () => {
      current = false;
    };
  }, [cardId, walletGeneration, of, round, onWeb, tick, again]);
  return {
    log: read !== null && read.of === of && read.round === round ? read.log : { phase: "reading" },
    now,
    retry: () => setRound((value) => value + 1)
  };
}

/** Nearly reached (ochre): 90 % of the limit, or more. */
function nearly(used: bigint, max: bigint): boolean {
  return used * 10n >= max * 9n;
}

/** How many calendar days of the device `at` comes after `now`. */
function daysAfter(at: number, now: number): number {
  const start = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  return Math.round((start(at) - start(now)) / 86_400_000);
}

/** "at 16:20", "tomorrow at 09:41", else "on" its date and time: its time in the device locale. */
export function whenOf(at: number, now: number, t: TFunction, languageTag: string): string {
  const time = formatDate(new Date(at), languageTag, { hour: "2-digit", minute: "2-digit" });
  const days = daysAfter(at, now);
  if (days === 0) return t("cards.limits.at", { time });
  if (days === 1) return t("cards.limits.tomorrowAt", { time });
  return t("cards.limits.on", {
    date: formatDate(new Date(at), languageTag, { dateStyle: "short", timeStyle: "short" })
  });
}

/**
 * The card's three limits: over 24 hours and this hour, with what the card spent (never before it
 * is read: "Reading the payments…", and nothing of it when it could not be read), then per payment;
 * each opens its form (`onEdit`).
 */
export function LimitsOverview({
  card,
  limitLog,
  now,
  onEdit,
  onRetry,
  onClose
}: {
  card: CardState;
  limitLog: LimitLog;
  now: number;
  onEdit: (limit: CardLimit) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const desktop = useIsDesktop();
  const onWeb = Platform.OS === "web";
  const usage = limitLog.phase === "ready" ? cardLimitUsage(card, limitLog.log, now) : null;
  const sats = (value: bigint) => formatInteger(value, languageTag);
  const paymentFiat = format.fiat(card.maxPaymentSats);
  const day = usage ? dayTexts(card, usage, now, t, languageTag, format.fiat) : null;
  const hour = usage ? hourTexts(card, usage, now, t, languageTag) : null;
  return (
    <View style={styles.content} testID="card-limits-list">
      <View style={styles.card}>
        <LimitButton
          title={t("cards.limits.day.title")}
          texts={day ? textsOf(day) : [t("cards.limits.day.limit", { max: sats(card.maxDaySats) })]}
          onPress={() => onEdit("maxDaySats")}
          separated
          testID="card-day"
        >
          {usage && day ? (
            <>
              <Figure {...day.figure} />
              <Gauge used={usage.daySats} max={card.maxDaySats} />
              {day.lines.map((line) => (
                <Line key={line.testID} {...line} />
              ))}
            </>
          ) : (
            <Line text={t("cards.limits.day.limit", { max: sats(card.maxDaySats) })} />
          )}
        </LimitButton>
        <LimitButton
          title={t("cards.limits.hour.title")}
          texts={
            hour
              ? textsOf(hour)
              : [t("cards.limits.hour.limit", { count: card.maxPaymentsPerHour })]
          }
          onPress={() => onEdit("maxPaymentsPerHour")}
          separated
          testID="card-hour"
        >
          {usage && hour ? (
            <>
              <Figure {...hour.figure} />
              <Segments used={usage.hourCount} max={card.maxPaymentsPerHour} />
              {hour.lines.map((line) => (
                <Line key={line.testID} {...line} />
              ))}
            </>
          ) : (
            <Line text={t("cards.limits.hour.limit", { count: card.maxPaymentsPerHour })} />
          )}
        </LimitButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[
            t("cards.limits.payment.title"),
            t("cards.limits.payment.caption"),
            `${sats(card.maxPaymentSats)} sats`,
            ...(paymentFiat ? [paymentFiat] : []),
            t("cards.limits.edit")
          ].join(", ")}
          onPress={() => onEdit("maxPaymentSats")}
          style={({ pressed }) => [styles.paymentRow, pressed && styles.pressed]}
          testID="card-ceiling"
        >
          <View style={styles.paymentTexts}>
            <Text style={styles.rowTitle}>{t("cards.limits.payment.title")}</Text>
            <Text style={styles.line}>{t("cards.limits.payment.caption")}</Text>
          </View>
          <View style={styles.paymentValue}>
            <Text style={styles.paymentSats}>{`${sats(card.maxPaymentSats)} sats`}</Text>
            {paymentFiat ? <Text style={styles.line}>{paymentFiat}</Text> : null}
          </View>
          <Icon name="chevron-right" size={11} color={colors.text.accent} />
        </Pressable>
      </View>
      {limitLog.phase === "reading" ? (
        <View style={styles.status} testID="card-limits-reading">
          <Spinner size={16} />
          <Text style={styles.line}>{t("cards.limits.reading")}</Text>
        </View>
      ) : limitLog.phase === "unread" ? (
        <>
          <Callout tone="warning" testID="card-limits-unread">
            {t(onWeb ? "cards.limits.unread" : "cards.limits.unreadPhone")}
          </Callout>
          <Button variant="secondary" size="md" onPress={onRetry} testID="card-limits-retry">
            {t("cards.retry")}
          </Button>
        </>
      ) : null}
      <Text style={styles.note}>
        {t(onWeb ? "cards.limits.noteWeb" : "cards.limits.notePhone")}
      </Text>
      {/* A desktop's dialog closes with its own button. */}
      {desktop ? null : (
        <Button variant="secondary" onPress={onClose} testID="card-limits-close">
          {t("cards.sheet.close")}
        </Button>
      )}
    </View>
  );
}

/**
 * "Limits" in "Cards": what the card spent over 24 hours and this hour against its limits, side by
 * side, then its ceiling per payment, counted as its panel counts them (the same read,
 * useCardLimitLog). Nothing of what it spent before it is read, nor when it could not be read: its
 * limits alone, and why under them (its panel offers "Try again"). Pressed as a whole, it opens
 * "Limits"; its label says all it shows.
 */
export function LimitsPreview({
  card,
  limits,
  onPress
}: {
  card: CardState;
  limits: CardLimitRead;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const onWeb = Platform.OS === "web";
  const { log, now } = limits;
  const usage = log.phase === "ready" ? cardLimitUsage(card, log.log, now) : null;
  const sats = (value: bigint) => formatInteger(value, languageTag);
  const day = usage ? dayTile(card, usage, t, languageTag) : null;
  const hour = usage ? hourTile(card, usage, now, t, languageTag) : null;
  const dayLimit = t("cards.limits.day.limit", { max: sats(card.maxDaySats) });
  const hourLimit = t("cards.limits.hour.limit", { count: card.maxPaymentsPerHour });
  const payment = t("cards.limits.satsHint", { max: sats(card.maxPaymentSats) });
  const status =
    log.phase === "reading"
      ? t("cards.limits.reading")
      : log.phase === "unread"
        ? t(onWeb ? "cards.limits.unread" : "cards.limits.unreadPhone")
        : null;
  const title = t("cards.home.limits");
  const label = [
    title,
    t("cards.limits.day.title"),
    ...(day ? textsOf(day) : [dayLimit]),
    t("cards.limits.hour.title"),
    ...(hour ? textsOf(hour) : [hourLimit]),
    t("cards.limits.payment.title"),
    payment,
    ...(status ? [status] : []),
    t("cards.limits.edit")
  ].join(", ");
  return (
    <ListRow
      inset={0}
      cornerRadius={radius.lg}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.preview}
      testID="card-limits"
    >
      <View style={styles.previewHead}>
        <RowIcon icon="scale-balanced" />
        <Text style={[styles.rowTitle, styles.previewTitle]}>{title}</Text>
        <View style={styles.edit}>
          <Text style={styles.editLabel}>{t("cards.limits.edit")}</Text>
          <Icon name="chevron-right" size={11} color={colors.text.accent} />
        </View>
      </View>
      <View style={styles.tiles}>
        <View style={styles.tile} testID="card-limits-day">
          <Text style={styles.tileTitle}>{t("cards.limits.day.title")}</Text>
          {usage && day ? (
            <>
              <Figure {...day.figure} />
              <Gauge used={usage.daySats} max={card.maxDaySats} testID="card-limits-gauge" />
              {day.lines.map((line) => (
                <Line key={line.testID} {...line} />
              ))}
            </>
          ) : (
            <Line text={dayLimit} />
          )}
        </View>
        <View style={styles.tile} testID="card-limits-hour">
          <Text style={styles.tileTitle}>{t("cards.limits.hour.title")}</Text>
          {usage && hour ? (
            <>
              <Figure {...hour.figure} />
              <Segments
                used={usage.hourCount}
                max={card.maxPaymentsPerHour}
                testID="card-limits-segments"
              />
              {hour.lines.map((line) => (
                <Line key={line.testID} {...line} />
              ))}
            </>
          ) : (
            <Line text={hourLimit} />
          )}
        </View>
      </View>
      <View style={styles.previewFoot}>
        <Text style={styles.line}>{t("cards.limits.payment.title")}</Text>
        <Text style={styles.previewPayment}>{payment}</Text>
      </View>
      {log.phase === "reading" ? (
        <View style={styles.status} testID="card-limits-preview-reading">
          <Spinner size={16} />
          <Text style={styles.line}>{status}</Text>
        </View>
      ) : status ? (
        <Line
          icon="triangle-exclamation"
          warned
          text={status}
          testID="card-limits-preview-unread"
        />
      ) : null}
    </ListRow>
  );
}

/** Over 24 hours, in "Cards": what the card spent, then what is left, or that it is reached. */
function dayTile(
  card: CardState,
  usage: CardLimitUsage,
  t: TFunction,
  languageTag: string
): LimitTexts {
  const left = card.maxDaySats - usage.daySats;
  return {
    figure: dayFigure(card, usage, t, languageTag),
    lines: [
      left <= 0n
        ? { warned: true, testID: "card-limits-day-left", text: t("cards.limits.preview.reached") }
        : {
            testID: "card-limits-day-left",
            text: t("cards.limits.day.leftSats", { amount: formatInteger(left, languageTag) })
          }
    ]
  };
}

/**
 * This hour, in "Cards": its payments, then how many more it takes, or, full, when the card pays
 * again (the later of the hour and the 24 hours, as its panel says it); in a pause, which refuses
 * every payment until its holder ends it, only that it is reached. The 24 hours full and the hour
 * not, nothing more: its payments left would be promised beside "Limit reached".
 */
function hourTile(
  card: CardState,
  usage: CardLimitUsage,
  now: number,
  t: TFunction,
  languageTag: string
): LimitTexts {
  const { hourFreeAt, dayFreeAt, hourCount } = usage;
  const figure = hourFigure(card, usage, t, languageTag);
  const testID = "card-limits-hour-left";
  if (hourFreeAt === null) {
    if (dayFreeAt !== null) return { figure, lines: [] };
    const left = Math.max(card.maxPaymentsPerHour - hourCount, 0);
    return {
      figure,
      lines: [{ testID, text: t("cards.limits.preview.hourLeft", { count: left }) }]
    };
  }
  if (card.suspended) {
    return { figure, lines: [{ warned: true, testID, text: t("cards.limits.preview.reached") }] };
  }
  const next = Math.max(hourFreeAt, dayFreeAt ?? hourFreeAt);
  return {
    figure,
    lines: [
      {
        icon: "clock",
        warned: true,
        testID,
        text: t("cards.limits.preview.hourNext", { when: whenOf(next, now, t, languageTag) })
      }
    ]
  };
}

/** "13,000 of 50,000 sats": what the card spent over 24 hours, of its limit. */
function dayFigure(
  card: CardState,
  usage: CardLimitUsage,
  t: TFunction,
  languageTag: string
): LimitTexts["figure"] {
  const sats = (value: bigint) => formatInteger(value, languageTag);
  return {
    value: sats(usage.daySats),
    of: t("cards.limits.day.of", { max: sats(card.maxDaySats) })
  };
}

/** "2 payments of 5": the card's payments of this hour, of its limit. */
function hourFigure(
  card: CardState,
  usage: CardLimitUsage,
  t: TFunction,
  languageTag: string
): LimitTexts["figure"] {
  return {
    value: formatInteger(usage.hourCount, languageTag),
    of: t("cards.limits.hour.of", {
      count: usage.hourCount,
      max: formatInteger(card.maxPaymentsPerHour, languageTag)
    })
  };
}

/** What "Limits" writes of a limit the card used: its figure, then its lines. */
type LimitTexts = { figure: { value: string; of: string }; lines: LineProps[] };

/** All of it as words, for its button's label: "13,000 of 50,000 sats", then its lines. */
function textsOf({ figure, lines }: LimitTexts): string[] {
  return [`${figure.value} ${figure.of}`, ...lines.map((line) => line.text)];
}

/** Over 24 hours: what the card spent, what is left, when their first payment leaves. */
function dayTexts(
  card: CardState,
  usage: CardLimitUsage,
  now: number,
  t: TFunction,
  languageTag: string,
  fiat: (sats: bigint) => string | null
): LimitTexts {
  const sats = (value: bigint) => formatInteger(value, languageTag);
  const left = card.maxDaySats - usage.daySats;
  const leftFiat = left > 0n ? fiat(left) : null;
  const lines: LineProps[] = [
    {
      warned: left <= 0n,
      testID: "card-day-left",
      text:
        left <= 0n
          ? t("cards.limits.day.reached")
          : leftFiat
            ? t("cards.limits.day.left", { amount: sats(left), fiat: leftFiat })
            : t("cards.limits.day.leftSats", { amount: sats(left) })
    }
  ];
  if (usage.dayRelease) {
    lines.push({
      icon: "clock",
      testID: "card-day-release",
      text: t("cards.limits.day.release", {
        amount: sats(usage.dayRelease.sats),
        when: whenOf(usage.dayRelease.at, now, t, languageTag)
      })
    });
  }
  return { figure: dayFigure(card, usage, t, languageTag), lines };
}

/**
 * This hour: its payments, then when the card pays again once it is full, which the 24 hours may
 * put off (the later of the two); in a pause, which refuses every payment until its holder ends
 * it, only when its first payment leaves, as when it is not full.
 */
function hourTexts(
  card: CardState,
  usage: CardLimitUsage,
  now: number,
  t: TFunction,
  languageTag: string
): LimitTexts {
  const { hourFreeAt, dayFreeAt, hourRelease } = usage;
  const figure = hourFigure(card, usage, t, languageTag);
  if (hourFreeAt !== null && !card.suspended) {
    const next = Math.max(hourFreeAt, dayFreeAt ?? hourFreeAt);
    return {
      figure,
      lines: [
        {
          icon: "clock",
          warned: true,
          testID: "card-hour-release",
          text: t("cards.limits.hour.reached", { when: whenOf(next, now, t, languageTag) })
        }
      ]
    };
  }
  if (!hourRelease) return { figure, lines: [] };
  const paid = formatDate(new Date(hourRelease.paidAt), languageTag, {
    hour: "2-digit",
    minute: "2-digit"
  });
  return {
    figure,
    lines: [
      {
        icon: "clock",
        warned: hourFreeAt !== null,
        testID: "card-hour-release",
        text: t("cards.limits.hour.release", {
          paid,
          when: whenOf(hourRelease.at, now, t, languageTag)
        })
      }
    ]
  };
}

/**
 * A limit of the card with what it used, pressed as a whole to change it ("Change"). A button is
 * read as one: its label says its title, its texts (`texts`, what its children show) and "Change",
 * which no screen reader would reach inside it.
 */
function LimitButton({
  title,
  texts,
  onPress,
  separated = false,
  testID,
  children
}: {
  title: string;
  texts: readonly string[];
  onPress: () => void;
  separated?: boolean;
  testID: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...texts, t("cards.limits.edit")].join(", ")}
        onPress={onPress}
        style={({ pressed }) => [styles.limit, pressed && styles.pressed]}
        testID={testID}
      >
        <View style={styles.limitHead}>
          <Text style={styles.rowTitle}>{title}</Text>
          <View style={styles.edit}>
            <Text style={styles.editLabel}>{t("cards.limits.edit")}</Text>
            <Icon name="chevron-right" size={11} color={colors.text.accent} />
          </View>
        </View>
        {children}
      </Pressable>
      {separated ? <View style={styles.separator} /> : null}
    </>
  );
}

/** "12,400 of 50,000 sats": what was used, large, then its limit, under it if need be. */
function Figure({ value, of }: { value: string; of: string }) {
  const styles = useStyles();
  return (
    <View style={styles.figureLine}>
      <Text style={styles.figure}>{value}</Text>
      <Text style={styles.of}>{of}</Text>
    </View>
  );
}

type LineProps = { text: string; icon?: IconName; warned?: boolean; testID?: string };

function Line({ text, icon, warned = false, testID }: LineProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = warned ? colors.warning.fg : colors.text.secondary;
  return (
    <View style={styles.lineRow} testID={testID}>
      {icon ? <Icon name={icon} size={11} color={color} /> : null}
      <Text style={[styles.line, { color }]}>{text}</Text>
    </View>
  );
}

/** Hidden from screen readers: the button it is in says its figure (LimitButton). */
const DRAWN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants"
} as const;

/** What was used of a limit of sats: a bar, ochre from 90 %, full at the limit or over it. */
function Gauge({
  used,
  max,
  testID = "card-limit-gauge"
}: {
  used: bigint;
  max: bigint;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // A width at the display edge only: per mille of the limit, the sats themselves stay bigint.
  const permille = max > 0n ? Number(((used < max ? used : max) * 1000n) / max) : 0;
  return (
    <View {...DRAWN} style={styles.track} testID={testID}>
      <View
        style={[
          styles.fill,
          {
            width: `${permille / 10}%`,
            backgroundColor: nearly(used, max) ? colors.warning.solid : palette.orange
          }
        ]}
      />
    </View>
  );
}

/** The payments of the hour: a segment each (a bar for more than MAX_SEGMENTS). */
function Segments({
  used,
  max,
  testID = "card-limit-segments"
}: {
  used: number;
  max: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (max > MAX_SEGMENTS) return <Gauge used={BigInt(used)} max={BigInt(max)} testID={testID} />;
  const fill = nearly(BigInt(used), BigInt(max)) ? colors.warning.solid : palette.orange;
  return (
    <View {...DRAWN} style={styles.segments} testID={testID}>
      {Array.from({ length: max }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: index < used ? fill : colors.background.subtle }
          ]}
        />
      ))}
    </View>
  );
}

/**
 * A whole number from 1 to `max`, digits only; an amount (`grouped`) may have spaces and marks of
 * grouping, a count never ("2.5" is not 25).
 */
function wholeOf(text: string, max: bigint, grouped: boolean): bigint | null {
  // \s covers the no-break spaces of grouping (U+00A0, U+202F); ' and ’ group digits in Switzerland.
  const digits = grouped ? text.replace(/[\s'’.]/g, "") : text.trim();
  if (!/^[0-9]{1,9}$/.test(digits)) return null;
  const value = BigInt(digits);
  return value >= 1n && value <= max ? value : null;
}

/** The title of a limit's form (its panel's, CardSheet.tsx). */
export const LIMIT_TITLES = {
  maxDaySats: "cards.limits.day.title",
  maxPaymentsPerHour: "cards.limits.hour.formTitle",
  maxPaymentSats: "cards.limits.payment.title"
} as const satisfies Record<CardLimit, string>;

/**
 * Changes one of the card's limits ("Change"): its new value, what that leaves (a limit at or under
 * what was used refuses every payment until the window frees up; the 24-hour limit under the one
 * per payment bounds each payment), and the passkey asked first, for any change (changeCardLimit):
 * its button says so, "Confirm with my passkey" and the key, whatever the new value. `onDone`:
 * back to the limits, saved or not. While it saves, `onBusy` keeps its panel open: the passkey is
 * asked over it, and what came of the change shows there, never in a panel opened after it.
 */
export function LimitEditor({
  card,
  limit,
  usage,
  onBusy,
  onDone,
  onFail
}: {
  card: CardState;
  limit: CardLimit;
  /** What the card used, null when not read. */
  usage: CardLimitUsage | null;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
  onFail: (error: unknown) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const desktop = useIsDesktop();
  const current = BigInt(card[limit]);
  const max = BigInt(CARD_LIMIT_MAX[limit]);
  const amount = limit !== "maxPaymentsPerHour";
  const [text, setText] = useState(current.toString());
  const [saving, setSaving] = useState(false);
  /** Why the passkey did not confirm the last attempt (dismissed: nothing said). */
  const [error, setError] = useState<string | null>(null);
  const value = wholeOf(text, max, amount);
  const sats = (of: bigint) => formatInteger(of, languageTag);
  useEffect(() => {
    if (!saving) return;
    onBusy(true);
    return () => onBusy(false);
  }, [saving, onBusy]);

  const notes: string[] = [];
  if (value !== null) {
    if (limit === "maxDaySats") {
      if (usage && value <= usage.daySats) {
        notes.push(t("cards.limits.day.belowUsed", { amount: sats(usage.daySats) }));
      }
      if (value < card.maxPaymentSats) {
        notes.push(t("cards.limits.day.belowPayment", { amount: sats(card.maxPaymentSats) }));
      }
    } else if (limit === "maxPaymentsPerHour") {
      if (usage && usage.hourCount > 0 && value <= BigInt(usage.hourCount)) {
        notes.push(t("cards.limits.hour.belowUsed", { count: usage.hourCount }));
      }
    } else if (value > card.maxDaySats) {
      notes.push(t("cards.limits.payment.aboveDay", { amount: sats(card.maxDaySats) }));
    }
  }
  const lead =
    limit === "maxDaySats"
      ? [
          t("cards.limits.day.lead"),
          ...(usage ? [t("cards.limits.day.used", { amount: sats(usage.daySats) })] : [])
        ].join(" ")
      : limit === "maxPaymentsPerHour"
        ? [
            t("cards.limits.hour.lead"),
            ...(usage ? [t("cards.limits.hour.used", { count: usage.hourCount })] : [])
          ].join(" ")
        : t("cards.limits.payment.lead");
  const fiat = amount && value !== null ? format.fiat(value) : null;
  const hint = !amount
    ? t("cards.limits.countHint", { max: formatInteger(max, languageTag) })
    : fiat
      ? t("cards.limits.fiatHint", { fiat, max: sats(max) })
      : t("cards.limits.satsHint", { max: sats(max) });
  const invalid = amount
    ? t("cards.sheet.ceilingInvalid", { max: `${sats(max)} sats` })
    : t("cards.sheet.hourInvalid", { max: formatInteger(max, languageTag) });
  const field = {
    maxDaySats: t("cards.limits.day.field"),
    maxPaymentsPerHour: t("cards.limits.hour.field"),
    maxPaymentSats: t("cards.limits.payment.field")
  }[limit];

  const save = () => {
    if (value === null || value === current) return;
    // Past the check of the 12 words, no raise (changeCardLimit): said before the passkey is asked.
    if (value > current && openAccountOverdue()) {
      setError(t("account.errors.recoveryOverdue"));
      return;
    }
    setSaving(true);
    setError(null);
    const saved =
      limit === "maxPaymentsPerHour"
        ? changeCardLimit(card.cardId, limit, Number(value))
        : changeCardLimit(card.cardId, limit, value);
    saved.then(onDone, (failure: unknown) => {
      setSaving(false);
      // The passkey's own failures say so; a dismissed prompt says nothing.
      if (
        failure instanceof PasskeyError ||
        failure instanceof OtherAccountError ||
        failure instanceof RecoveryCheckOverdueError
      ) {
        const unlock = toUnlockFailure(failure);
        if (unlock) logFailure("The passkey for a card's limit failed", failure);
        setError(unlock ? unlockFailureMessage(unlock, t) : null);
        return;
      }
      onFail(failure);
    });
  };
  return (
    <View style={styles.content} testID={`card-limit-${limit}`}>
      <Text style={styles.prose}>{lead}</Text>
      <View style={styles.fieldBlock}>
        <TextField
          label={field}
          value={text}
          onChangeText={(next) => {
            setText(next);
            setError(null);
          }}
          keyboardType="number-pad"
          trailing={amount ? <Text style={styles.unit}>sats</Text> : undefined}
          error={value === null ? invalid : null}
          testID="card-limit-field"
        />
        {value !== null ? (
          <Text style={styles.line} testID="card-limit-hint">
            {hint}
          </Text>
        ) : null}
      </View>
      {notes.map((note) => (
        <Callout key={note} tone="warning" testID="card-limit-note">
          {note}
        </Callout>
      ))}
      {error ? (
        <Callout tone="error" testID="card-limit-error">
          {error}
        </Callout>
      ) : null}
      {desktop ? (
        <View style={styles.dialogActions}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={saving}
            onPress={onDone}
            style={styles.dialogCancel}
            testID="card-limit-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            fullWidth={false}
            icon="key"
            disabled={value === null || value === current}
            loading={saving}
            onPress={save}
            style={styles.dialogSave}
            testID="card-limit-save"
          >
            {t("cards.limits.confirm")}
          </Button>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            size="lg"
            icon="key"
            disabled={value === null || value === current}
            loading={saving}
            onPress={save}
            testID="card-limit-save"
          >
            {t("cards.limits.confirm")}
          </Button>
          <Button
            variant="text"
            size="md"
            disabled={saving}
            onPress={onDone}
            testID="card-limit-cancel"
          >
            {t("common.cancel")}
          </Button>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  content: { gap: space[5] },
  actions: { gap: space[2] },
  // A desktop's.
  dialogActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  dialogCancel: { minWidth: 120 },
  dialogSave: { minWidth: 180 },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}`
  },
  limit: { gap: 8, padding: 16 },
  pressed: { backgroundColor: colors.hoverOverlay },
  limitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  edit: { flexDirection: "row", alignItems: "center", gap: 8 },
  editLabel: { ...sans(600), fontSize: 13, color: colors.text.accent },
  separator: { height: 1, marginHorizontal: 16, backgroundColor: colors.border.subtle },
  // Its limit under the figure where both do not fit (a tile of "Cards"'s "Limits").
  figureLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 5 },
  figure: {
    ...sans(600),
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  of: {
    ...sans(500),
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  fill: { height: 8, borderRadius: radius.pill },
  segments: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  line: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  paymentTexts: { flex: 1, gap: 2 },
  paymentValue: { alignItems: "flex-end", gap: 1 },
  paymentSats: {
    ...sans(600),
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  prose: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  fieldBlock: { gap: 6 },
  // "Limits" in "Cards" (LimitsPreview): its head as a row's (CardRows.tsx), its tiles.
  preview: { gap: 12, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16 },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  previewTitle: { flex: 1 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    padding: 12,
    borderRadius: radius.md,
    boxShadow: `inset 0 0 0 1px ${colors.border.faint}`
  },
  tileTitle: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  previewFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2
  },
  previewPayment: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.caption,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    color: colors.text.primary
  },
  unit: { ...sans(500), fontSize: 15, color: colors.text.secondary }
}));
