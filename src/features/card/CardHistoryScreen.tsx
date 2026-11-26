import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { dayListedWhole, dayNet, dayNetText, localDayStart } from "@/features/activity/day-net";
import { MovementAmounts, MovementDay, MovementRow } from "@/features/activity/MovementList";
import { useAmountUnit } from "@/features/settings/amount-unit";
import type { AmountUnit } from "@/features/settings/amount-unit-format";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { dayKey, dayOf } from "@/features/wallet/model";
import type { PendingDeposit } from "@/lib/breez/types";
import type { CardState } from "@/lib/card/card-record";
import { formatDate } from "@/lib/locale/date";
import { gutter, makeStyles, sans, space, tracked, type, useTheme } from "@/theme";

import { CardHistoryDetail, detailTitle } from "./CardHistoryDetail";
import { cardLabel } from "./card-label";
import { depositLook, rowLook, rowNetPart, satsText } from "./history-format";
import { LegacyHistoryOffer } from "./LegacyHistoryOffer";
import type { CardHistoryRow } from "./history-view";
import { useCardHistory } from "./useCardHistory";

/*
 * "History" of a card, a screen of its own over "Cards": what is on its way first ("In progress",
 * the on-chain deposits not in the balance yet, sats only: not the card's yet, no rate fixed for
 * them), then every movement by day, newest first: its payments (refused ones struck through,
 * without value), its top-ups and its returns, each with its value at the rate of its hour as it
 * was kept (history-view.ts), as "Wallet" lists its own (its value first by default, each day's
 * net). A card migrated from Swiss Bitcoin Pay lists its v2 history among the rest
 * (useCardHistory), its PIN asked when its copy needs it (LegacyHistoryOffer.tsx). A row opens its
 * details (CardHistoryDetail.tsx). Beyond the records' 90 days, "Show {{month}}" shows a month more
 * at a time (the copies of the months are read on demand). What is not read yet is said, never
 * shown as empty.
 */
export function CardHistoryScreen({ card }: { card: CardState }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  // "Card Daily"; a card without a name is "Card 9D81" already.
  const subtitle = card.name
    ? t("cards.history.subtitle", { name: card.name })
    : cardLabel(card, t);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  return (
    <PosFrame
      title={
        <View style={styles.titles}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {t("cards.history.title")}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
      }
      desktopTitle={t("cards.history.title")}
      subtitle={subtitle}
      leading={{
        icon: "chevron-left",
        label: t("common.back"),
        onPress: back,
        testID: "card-history-back"
      }}
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID="card-history-back-desktop"
        >
          {t("common.back")}
        </Button>
      }
      flush="mobile"
    >
      {desktop ? (
        <CardHistoryList card={card} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} testID="card-history">
          <CardHistoryList card={card} />
        </ScrollView>
      )}
    </PosFrame>
  );
}

/**
 * The card's movements as "History" lists them: on its screen (phone), on the page of "Cards" under
 * the card chosen (desktop).
 */
export function CardHistoryList({ card, refreshKey }: { card: CardState; refreshKey?: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { view, reload, refresh, showOlder, copyLegacy } = useCardHistory(
    card,
    card.issuer?.number ?? null
  );
  // Read again, what shows kept, each time "Cards" asks it (`refreshKey`: its balance moved).
  const [asked, setAsked] = useState(refreshKey);
  if (asked !== refreshKey) {
    setAsked(refreshKey);
    refresh();
  }
  // The row opened, by its key: the panel shows it as the reads now tell it, as it was when it
  // opened if it left the list.
  const [detail, setDetail] = useState<{ row: CardHistoryRow; open: boolean } | null>(null);

  if (view.phase === "loading") {
    return (
      <View style={styles.waiting} testID="card-history-loading">
        <Spinner size={20} />
        <Text style={styles.waitingText}>{t("cards.history.reading")}</Text>
      </View>
    );
  }
  if (view.phase === "failed") {
    return (
      <View style={styles.body}>
        <Callout tone="error" testID="card-history-failed">
          {t("cards.history.failed")}
        </Callout>
        <Button variant="secondary" onPress={reload} testID="card-history-retry">
          {t("cards.retry")}
        </Button>
      </View>
    );
  }

  const pending = view.pending ?? [];
  // "No movement" only once everything was read whole: never while some may be missing.
  const empty =
    view.rows.length === 0 &&
    pending.length === 0 &&
    !view.reading &&
    !view.ownOnly &&
    !view.walletFailed &&
    !view.newer &&
    !view.legacyUnread &&
    view.legacy === "none";
  const { older } = view;
  // Every movement since the list's horizon is listed once everything was read whole: its days'
  // nets from then. Never while some may be missing.
  const listedFrom =
    view.reading ||
    view.ownOnly ||
    view.walletFailed ||
    view.newer ||
    older.incomplete ||
    view.legacyUnread ||
    view.legacy !== "none"
      ? null
      : view.horizon;
  const shown = detail ? (view.rows.find((row) => row.key === detail.row.key) ?? detail.row) : null;
  return (
    <View style={styles.body} testID="card-history-list">
      {view.reading ? (
        <View style={styles.reading} testID="card-history-reading">
          <Spinner size={14} />
          <Text style={styles.note}>{t("cards.history.reading")}</Text>
        </View>
      ) : null}
      {view.ownOnly ? (
        <Callout tone="warning" testID="card-history-own">
          {t("cards.history.ownOnly")}
        </Callout>
      ) : null}
      {view.legacyUnread && !view.ownOnly ? (
        // Its v2 history's copy not read from a majority: its rows, and its months, may be missing.
        <Callout tone="warning" testID="card-history-legacy-unread">
          {t("cards.history.legacyUnread")}
        </Callout>
      ) : null}
      {view.walletFailed ? (
        <Callout tone="warning" testID="card-history-wallet-failed">
          {t("cards.history.walletFailed")}
        </Callout>
      ) : null}
      {view.newer ? (
        <Callout tone="warning" testID="card-history-newer">
          {t("cards.history.newer")}
        </Callout>
      ) : null}
      <LegacyHistoryOffer phase={view.legacy} copy={copyLegacy} />
      {pending.length > 0 ? <PendingGroup deposits={pending} /> : null}
      <Days
        rows={view.rows}
        listedFrom={listedFrom}
        onOpen={(row) => setDetail({ row, open: true })}
      />
      {empty && older.month === null && !older.ahead ? (
        <Text style={styles.empty} testID="card-history-empty">
          {t("cards.history.empty")}
        </Text>
      ) : null}
      {older.ahead ? (
        // The copy that tells the month to offer, read first (useCardHistory); "Try again" after
        // a failure.
        <View style={styles.older}>
          {older.phase === "failed" ? (
            <>
              <Callout tone="error" testID="card-history-month-failed">
                {t("cards.history.monthFailed")}
              </Callout>
              <Button variant="secondary" onPress={showOlder} testID="card-history-older-retry">
                {t("cards.retry")}
              </Button>
            </>
          ) : (
            <View style={styles.olderReading} testID="card-history-older-reading">
              <Spinner size={20} />
            </View>
          )}
        </View>
      ) : null}
      {older.month !== null ? (
        <View style={styles.older}>
          {older.phase === "failed" ? (
            <Callout tone="error" testID="card-history-month-failed">
              {t("cards.history.monthFailed")}
            </Callout>
          ) : null}
          <Button
            variant="secondary"
            loading={older.phase === "loading"}
            onPress={showOlder}
            testID="card-history-older"
          >
            {t(older.partly ? "cards.history.showMonthAll" : "cards.history.showMonth", {
              month: monthLabel(older.month, languageTag)
            })}
          </Button>
        </View>
      ) : null}
      {older.incomplete ? (
        <Text style={styles.note} testID="card-history-incomplete">
          {t("cards.history.monthIncomplete")}
        </Text>
      ) : null}
      <Sheet
        title={shown ? detailTitle(shown, t) : ""}
        closeLabel={t("cards.sheet.close")}
        visible={detail?.open ?? false}
        onClose={() => setDetail((shown) => (shown ? { ...shown, open: false } : shown))}
        testID="card-history-detail"
      >
        {shown ? <CardHistoryDetail row={shown} fees={view.fees} /> : null}
      </Sheet>
    </View>
  );
}

/** "July 2026": a month ("YYYY-MM") in the device's own words. */
function monthLabel(month: string, languageTag: string): string {
  const [year, number] = month.split("-").map(Number);
  // Its middle, in the device's time: the same month in any time zone.
  return formatDate(new Date(year, number - 1, 15), languageTag, {
    month: "long",
    year: "numeric"
  });
}

/** "In progress": the card's on-chain deposits not in its balance yet, as its wallet tells them. */
function PendingGroup({ deposits }: { deposits: PendingDeposit[] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  return (
    <MovementDay label={t("cards.history.pendingGroup")} net={null} testID="card-history-pending">
      {deposits.map((deposit, index) => {
        const look = depositLook(deposit, t, languageTag, colors);
        // Unsigned, as what came in, not green: not in the balance yet. In
        // sats whatever the amounts' unit: no rate is fixed for it yet.
        const amount = satsText(deposit.amountSats, languageTag);
        return (
          <MovementRow
            key={`${deposit.txid}:${deposit.vout}`}
            icon={{ name: look.icon, bg: look.iconBg, fg: look.iconFg }}
            title={t("cards.history.deposit")}
            caption={look.caption}
            captionColor={look.captionColor}
            amounts={<MovementAmounts primary={amount} color={colors.text.primary} />}
            separated={index < deposits.length - 1}
            accessibilityLabel={`${t("cards.history.deposit")}, ${look.caption}, ${amount}`}
            testID={`card-history-deposit-${deposit.txid}-${deposit.vout}`}
          />
        );
      })}
    </MovementDay>
  );
}

/**
 * The movements by day of the device, newest first: "Today", "Yesterday", then dates, each day's
 * net at its right when all of it is listed (`listedFrom`,
 * ms; null: none is told).
 */
function Days({
  rows,
  listedFrom,
  onOpen
}: {
  rows: CardHistoryRow[];
  listedFrom: number | null;
  onOpen: (row: CardHistoryRow) => void;
}) {
  const format = useWalletFormat();
  const { languageTag } = usePos();
  const unit = useAmountUnit();
  const now = new Date();
  const days: { key: string; label: string; rows: CardHistoryRow[] }[] = [];
  for (const row of rows) {
    const seconds = Math.floor(row.at / 1000);
    const key = dayKey(new Date(row.at));
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(row);
    else days.push({ key, label: format.day(dayOf(seconds, now)), rows: [row] });
  }
  const netOf = (day: (typeof days)[number]): string | null => {
    if (!dayListedWhole(localDayStart(day.rows[0]!.at), listedFrom)) return null;
    const net = dayNet(
      day.rows.flatMap((row) => rowNetPart(row) ?? []),
      unit
    );
    return net === null ? null : dayNetText(net, languageTag);
  };
  return (
    <>
      {days.map((day) => (
        <MovementDay
          key={day.key}
          label={day.label}
          net={netOf(day)}
          testID={`card-history-day-${day.key}`}
        >
          {day.rows.map((row, index) => (
            <HistoryRow
              key={row.key}
              row={row}
              unit={unit}
              separated={index < day.rows.length - 1}
              onPress={() => onOpen(row)}
            />
          ))}
        </MovementDay>
      ))}
    </>
  );
}

/**
 * A movement: its value written first ("Currency shown first", settings/amount-unit.ts,
 * the display currency by default), signed as its sats, its sats under it; its sats alone when no
 * value is kept for it (or nothing moved: struck through).
 */
function HistoryRow({
  row,
  unit,
  separated,
  onPress
}: {
  row: CardHistoryRow;
  unit: AmountUnit;
  separated: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const look = rowLook(row, format.time(Math.floor(row.at / 1000)), t, languageTag, colors);
  const valueFirst = unit === "fiat" && look.fiat !== null;
  const primary = valueFirst ? `${look.sign}${look.fiat}` : look.amount;
  const secondary = valueFirst ? look.sats : look.fiat;
  return (
    <MovementRow
      icon={{ name: look.icon, bg: look.iconBg, fg: look.iconFg }}
      title={look.title}
      caption={look.caption}
      captionColor={look.captionColor}
      amounts={
        <MovementAmounts
          primary={primary}
          color={look.amountColor}
          struck={look.struck}
          secondary={secondary ?? undefined}
          testID={`card-history-amount-${row.key}`}
        />
      }
      separated={separated}
      onPress={onPress}
      accessibilityLabel={[look.title, look.caption, primary, secondary].filter(Boolean).join(", ")}
      testID={`card-history-row-${row.key}`}
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  titles: { alignItems: "center" },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  subtitle: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  scroll: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: 40 },
  body: { gap: 20 },
  waiting: { alignItems: "center", gap: space[5], paddingTop: 48 },
  waitingText: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  reading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  empty: {
    ...sans(500),
    textAlign: "center",
    fontSize: type.prose,
    color: colors.text.secondary
  },
  older: { gap: space[4] },
  olderReading: { alignItems: "center", paddingVertical: space[2] },
  note: { ...sans(500), fontSize: type.caption, lineHeight: 18, color: colors.text.secondary }
}));
