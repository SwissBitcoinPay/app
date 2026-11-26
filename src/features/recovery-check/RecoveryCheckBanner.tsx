import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { WindowInsetsContext } from "@/components/ui/overlay";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { nowUnix } from "@/lib/clock";
import { gutter, makeStyles, mono, sans, type, useTheme } from "@/theme";

import { daysLeft, recoveryCheckState, type RecoveryCheckState } from "./policy";

/** How often the banner reads the clock again: its days, and the end of its 30 days. */
const TICK_MS = 60_000;

/** The check of the open account's words now, read again each minute while one is due. */
export function useRecoveryCheckState(): { state: RecoveryCheckState; now: number } {
  const settings = useAccountSettings();
  const due = settings?.recoveryCheck.dueSince ?? null;
  // The clock read again as a check starts or changes (here, or from another device): the time read
  // when none was due would say a day more than 30 left, or "due" for one already over.
  const [clock, setClock] = useState(() => ({ due, now: nowUnix() }));
  if (clock.due !== due) setClock({ due, now: nowUnix() });
  const { now } = clock;
  useEffect(() => {
    if (due === null) return;
    const timer = setInterval(() => setClock({ due, now: nowUnix() }), TICK_MS);
    return () => clearInterval(timer);
  }, [due]);
  // Its sign-up not done: nothing is due yet (holdings.ts starts none before).
  if (!settings || settings.signUp !== "done") return { state: { kind: "none" }, now };
  return { state: recoveryCheckState(settings.recoveryCheck, now), now };
}

/**
 * The banner over the app's screens while a check of the 12 words is due: "Your spare key is not
 * checked", the days left and "Check my 12 words"; past the 30 days, red, the payments
 * blocked (overdue.ts). On top of the screens, in the status bar's room: the screens under it get a
 * safe area without its top (a panel takes the window's back: WindowInsetsContext). Shown by
 * AppShell to the owner only, the app unlocked: never in till mode, before a customer, nor on an
 * employee's device. In the dark theme its ink turns cream, as the ink buttons.
 */
export function RecoveryCheckFrame({
  shown,
  onCheck,
  children
}: {
  /** Whether the banner may show (the owner's app unlocked, not on the check's own screens). */
  shown: boolean;
  onCheck: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { state, now } = useRecoveryCheckState();
  const banner = shown && state.kind !== "none" ? state : null;
  // One tree whether the banner shows or not: the screens are never mounted again as it comes or
  // goes (an invoice shown would be asked anew, the wallet connected again: AppShell.tsx).
  return (
    <>
      {banner ? (
        <RecoveryCheckBanner state={banner} now={now} top={insets.top} onCheck={onCheck} />
      ) : null}
      <WindowInsetsContext.Provider value={banner ? insets : null}>
        <SafeAreaInsetsContext.Provider value={banner ? { ...insets, top: 0 } : insets}>
          {children}
        </SafeAreaInsetsContext.Provider>
      </WindowInsetsContext.Provider>
    </>
  );
}

function RecoveryCheckBanner({
  state,
  now,
  top,
  onCheck
}: {
  state: Exclude<RecoveryCheckState, { kind: "none" }>;
  now: number;
  top: number;
  onCheck: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const overdue = state.kind === "overdue";
  const days = state.kind === "due" ? daysLeft(state.endsAt, now) : 0;
  const label = overdue ? colors.button.dangerSolid.label : colors.button.ink.label;
  return (
    <View
      style={[styles.banner, overdue ? styles.overdue : styles.due, { paddingTop: top + 12 }]}
      accessibilityRole={overdue ? "alert" : "summary"}
      testID="recovery-check-banner"
    >
      <View style={styles.row}>
        <Icon
          name={overdue ? "triangle-exclamation" : "key"}
          size={19}
          color={overdue ? label : colors.background.accent}
        />
        <Text style={[styles.text, { color: label }]} testID="recovery-check-banner-text">
          {overdue ? t("recoveryCheck.banner.overdue") : t("recoveryCheck.banner.due")}
        </Text>
        {overdue ? null : (
          <Text
            style={[styles.days, { color: label }]}
            accessibilityLabel={t("recoveryCheck.banner.daysLeftLabel", { count: days })}
            testID="recovery-check-banner-days"
          >
            {t("recoveryCheck.banner.daysLeft", { count: days })}
          </Text>
        )}
      </View>
      <Button
        variant={overdue ? "secondary" : "primary"}
        size="sm"
        onPress={onCheck}
        testID="recovery-check-banner-action"
      >
        {t("recoveryCheck.banner.action")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  banner: { paddingHorizontal: gutter, paddingBottom: 14, gap: 12 },
  due: { backgroundColor: colors.button.ink.bg },
  overdue: { backgroundColor: colors.button.dangerSolid.bg },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { ...sans(600), flex: 1, fontSize: type.sats, lineHeight: type.sats * 1.4 },
  days: { ...mono(500), fontSize: type.caption }
}));
