import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { openExternal } from "@/components/ui/external-link";
import { Lead } from "@/components/ui/Heading";
import { MTPELERIN_IDENTITY_URL, SELL_LIMITS_IDENTIFIED_CHF_MINOR } from "@/config/mtpelerin";
import { usePos } from "@/features/terminal/pos";
import { formatDate } from "@/lib/locale/date";
import { MONTH_DAYS, isIdentified, sellLimits, type LimitUse } from "@/lib/mtpelerin/limits";
import { makeStyles, radius, sans } from "@/theme";

import { Card, Failure, SellBody, Waiting, busyText, fiatText } from "./parts";
import { useSellNav } from "./SellSheet";
import { useOrders } from "./useOrders";

/*
 * "Sale limits", a page of "Sell"'s panel: what Mt Pelerin buys without
 * an identity verification (999 CHF a sale and a month, 11 988 CHF a year, fees included), and
 * what the profile's orders of the last 30 days ("This month": Mt Pelerin's month
 * is not known to be a calendar one, limits.ts `periodStarts`) and of the year used (limits.ts). A
 * period with an order the app cannot value in francs says so, rather than a smaller figure. Mt
 * Pelerin sets no daily limit. The app verifies no identity: the merchant is identified at Mt
 * Pelerin itself, where the page sends them; identified, the limits
 * no longer hold and the page says so, with those that do: a sale's, no month nor year.
 */
export function LimitsPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow } = useSellNav();
  const { languageTag } = usePos();
  const { read, retry } = useOrders(flow);
  const person = flow.profile()?.person ?? null;
  // Identified at Mt Pelerin: the limits without a verification no longer hold, those of
  // an identified profile show instead (SELL_LIMITS_IDENTIFIED_CHF_MINOR: a sale's only, no month
  // nor year), from Mt Pelerin's pages: no order is read for them.
  if (person !== null && isIdentified(person)) {
    return (
      <SellBody testID="sell-limits">
        <Callout tone="success" testID="sell-limits-identified">
          {t("sell.limits.identified")}
        </Callout>
        <Card testID="sell-limits-identified-card">
          <View style={styles.line}>
            <Text style={styles.title}>{t("sell.limits.perSale")}</Text>
            <Text style={styles.title} testID="sell-limits-identified-sale">
              {fiatText(SELL_LIMITS_IDENTIFIED_CHF_MINOR.sale, "CHF", languageTag)}
            </Text>
          </View>
          {[t("sell.limits.perMonth"), t("sell.limits.perYear")].map((label) => (
            <View key={label} style={[styles.line, styles.divided]}>
              <Text style={styles.title}>{label}</Text>
              <Text style={styles.figure}>{t("sell.limits.noLimit")}</Text>
            </View>
          ))}
        </Card>
      </SellBody>
    );
  }
  const now = new Date(read.state === "ready" ? read.readAt : 0);
  const limits = read.state === "ready" ? sellLimits(read.orders, now) : null;
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  const day = (date: Date) => formatDate(date, languageTag, { day: "numeric", month: "long" });

  return (
    <SellBody testID="sell-limits">
      <Lead style={styles.lead}>{t("sell.limits.lead")}</Lead>
      <View>
        {read.state === "loading" ? (
          <Waiting label={busyText(t, "reading")} />
        ) : read.state === "failed" || limits === null ? (
          <Failure failure={{ kind: "offline", retry }} />
        ) : (
          <Card>
            <View style={styles.line}>
              <Text style={styles.title}>{t("sell.limits.perSale")}</Text>
              <Text style={styles.title}>{fiatText(limits.sale, "CHF", languageTag)}</Text>
            </View>
            {/* The month counts back MONTH_DAYS days (limits.ts): it frees no amount on a date. */}
            <Meter
              label={t("sell.limits.month", { days: MONTH_DAYS })}
              use={limits.month}
              left={(amount) => t("sell.limits.leftRolling", { amount, days: MONTH_DAYS })}
              testID="sell-limit-month"
            />
            <Meter
              label={t("sell.limits.year")}
              use={limits.year}
              left={(amount) => t("sell.limits.leftUntil", { amount, date: day(nextYear) })}
              testID="sell-limit-year"
            />
          </Card>
        )}
      </View>
      <Callout tone="success" icon="circle-info" title={t("sell.limits.feesTitle")}>
        {t("sell.limits.fees")}
      </Callout>
      {/* The identity is verified by Mt Pelerin itself, on its pages. */}
      <View style={styles.identify}>
        <Text style={styles.hint}>{t("sell.limits.identifyHow")}</Text>
        <Button
          variant="secondary"
          icon="arrow-up-right-from-square"
          onPress={() => openExternal(MTPELERIN_IDENTITY_URL)}
          testID="sell-limits-identify"
        >
          {t("sell.split.identify")}
        </Button>
      </View>
    </SellBody>
  );
}

function Meter({
  label,
  use,
  left,
  testID
}: {
  label: string;
  use: LimitUse;
  /** What is left, said with `amount` (formatted). */
  left: (amount: string) => string;
  testID: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { usedMinor, limitMinor } = use;
  const share = usedMinor === null ? 0 : Math.min(1, usedMinor / limitMinor);
  return (
    <View style={[styles.meter, styles.divided]} testID={testID}>
      <View style={styles.line}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.figure}>
          {usedMinor === null
            ? `— / ${fiatText(limitMinor, "CHF", languageTag)}`
            : `${fiatText(usedMinor, "CHF", languageTag)} / ${fiatText(limitMinor, "CHF", languageTag)}`}
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: limitMinor, now: usedMinor ?? 0 }}
      >
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
      <Text style={styles.hint}>
        {usedMinor === null
          ? t("sell.limits.unknown")
          : left(fiatText(Math.max(0, limitMinor - usedMinor), "CHF", languageTag))}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  lead: { marginTop: 0 },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    paddingVertical: 14
  },
  title: { ...sans(700), fontSize: 15, color: colors.text.primary },
  figure: {
    ...sans(600),
    fontSize: 13.5,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  meter: { paddingBottom: 14 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.text.primary },
  hint: { ...sans(500), marginTop: 8, fontSize: 12.5, color: colors.text.secondary },
  identify: { gap: 4 }
}));
