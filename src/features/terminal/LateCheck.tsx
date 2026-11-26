import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Countdown } from "@/components/ui/Countdown";
import { Icon } from "@/components/ui/Icon";
import { LNURL_TIMEOUT_MS } from "@/lib/lightning/lnurl";
import { gutter, makeStyles, proseLineHeight, sans, space, tracked, type, useTheme } from "@/theme";

import { EXPIRY_GRACE_SECONDS } from "./invoice";

/*
 * A sale ended with nothing received: its invoices are still checked for 2 minutes, a payment of
 * them may still be reported (EXPIRY_GRACE_SECONDS, `lateUntil` of useSale). What the point of sale
 * (src/app/(app)/pos/charge.tsx) and the payer's page (src/app/pay.tsx) show meanwhile (a blank
 * plate under a spinner, at 00:00, would look like a stuck screen).
 */

/**
 * Past the end of those checks, how long their countdown stays at 00:00 while the last check is
 * answered (its request's timeout). Then, the sale still checked (the LNURL server failing, the
 * explorer or the relays not read), it gives way: no countdown stuck at zero.
 */
const LAST_CHECK_SECONDS = LNURL_TIMEOUT_MS / 1000;

/** In the code's plate (`CodePlate`'s `ended`): the request expired, a payment may still come. */
export function EndedRequest({ desktop }: { desktop: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.ended, desktop && styles.endedDesktop]} testID="request-ended">
      <Icon name="hourglass-end" size={desktop ? 34 : 28} color={colors.state.expired.fg} />
      <Text style={[styles.title, desktop && styles.titleDesktop]}>{t("pos.lateCheck.title")}</Text>
      <Text style={styles.body}>{t("pos.lateCheck.body")}</Text>
    </View>
  );
}

/**
 * In the code's plate (`CodePlate`'s `ended`): a payment came, and whether it belongs to this sale
 * only is checked for long (SaleState `settling`).
 */
export function SettlingPayment({ desktop }: { desktop: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.ended, desktop && styles.endedDesktop]} testID="payment-settling">
      <Icon name="circle-check" size={desktop ? 34 : 28} color={colors.success.fg} />
      <Text style={[styles.title, desktop && styles.titleDesktop]}>{t("pos.settling.title")}</Text>
      <Text style={styles.body}>{t("pos.settling.body")}</Text>
    </View>
  );
}

/**
 * "Check ends in": the time left until `lateUntil` (Unix seconds, nowUnix, as
 * `now`), then 00:00 while the last check may be answered; out of sight, kept in place, once the
 * sale is still checked past that, or when no invoice is checked any more (`lateUntil` null).
 */
export function LateCountdown({ lateUntil, now }: { lateUntil: number | null; now: number }) {
  const { t } = useTranslation();
  const left = lateUntil === null ? null : lateUntil - now;
  const seconds = Math.max(0, left ?? 0);
  return (
    <Countdown
      label={t("pos.lateCheck.endsIn")}
      seconds={seconds}
      progress={seconds / EXPIRY_GRACE_SECONDS}
      hidden={left === null || left <= -LAST_CHECK_SECONDS}
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  ended: { alignItems: "center", paddingHorizontal: gutter },
  endedDesktop: { paddingHorizontal: space[10] },
  title: {
    ...sans(600),
    marginTop: space[5],
    fontSize: type.body,
    color: colors.text.primary,
    textAlign: "center"
  },
  titleDesktop: { fontSize: type.title, letterSpacing: tracked.title },
  body: {
    ...sans(500),
    marginTop: space[3],
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
