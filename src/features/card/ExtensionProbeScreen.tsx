import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead } from "@/components/ui/Heading";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { GroupLabel, SettingsCard } from "@/features/settings/parts";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { isCardHolderProfile } from "@/lib/terminal/model";
import {
  clearProbeRuns,
  PROBE_MODES,
  PROBE_PROFILES,
  probeAvailable,
  readProbeRuns,
  type ProbeMode,
  type ProbeProfile,
  type ProbeRun
} from "@/lib/card/probe-store";
import { formatDate } from "@/lib/locale/date";
import { formatDecimal, formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { gutter, makeStyles, mono, sans, space, tracked, type } from "@/theme";

import { launchCardTextTest, launchProbe, probeReport } from "./extension-probe";

/**
 * "iOS extension test" (staging on an iPhone): runs the notification service extension's test
 * (extension-probe.ts) and hands its results over ("Copy the results"). Technical measures, for the
 * team.
 */
export function ExtensionProbeScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  // The payment test pays the account's Lightning address: a card holder's account has none (no
  // main wallet, src/features/account/main-wallet.ts); its other tests run all the same.
  const { profile } = usePos();
  const lightningAddress = isCardHolderProfile(profile) ? null : profile.lightningAddress;
  return (
    <PosFrame
      title={t("cards.probe.title")}
      desktopTitle={t("cards.probe.title")}
      leading={{ icon: "arrow-left", label: t("common.back"), onPress: back, testID: "probe-back" }}
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID="probe-back-desktop"
        >
          {t("common.back")}
        </Button>
      }
      flush="mobile"
    >
      {probeAvailable() ? (
        <ProbeBody lightningAddress={lightningAddress} />
      ) : (
        <View style={styles.body}>
          <Lead>{t("cards.probe.unavailable")}</Lead>
        </View>
      )}
    </PosFrame>
  );
}

/** How often the screen reads what the extension recorded while it shows. */
const READ_INTERVAL_MS = 2_000;

function readView(): { runs: ProbeRun[]; now: number } {
  return { runs: readProbeRuns(), now: Date.now() };
}

function ProbeBody({ lightningAddress }: { lightningAddress: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { languageTag } = usePos();
  const [profile, setProfile] = useState<ProbeProfile>("light");
  const [launching, setLaunching] = useState<ProbeMode | "cardText" | null>(null);
  // What the extension recorded, and when it was read: a run's outcome depends on its age.
  const [{ runs, now }, setView] = useState(readView);
  const read = () => setView(readView());

  useEffect(() => {
    const timer = setInterval(() => setView(readView()), READ_INTERVAL_MS);
    // Back from the lock screen, where the extension's notification showed.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") setView(readView());
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, []);

  const launch = async (mode: ProbeMode) => {
    setLaunching(mode);
    try {
      const outcome = await launchProbe({
        mode,
        profile,
        lightningAddress,
        text: {
          title: t("cards.probe.notification.title"),
          body: t("cards.probe.notification.body")
        },
        channelName: t("card.notificationChannel")
      });
      if (outcome.status === "sent") {
        notify({ tone: "success", title: t("cards.probe.sent"), key: "probe" });
      } else {
        notify({
          tone: "error",
          title: t(`cards.probe.failed.${outcome.reason}`),
          body: outcome.detail ?? undefined,
          key: "probe"
        });
      }
    } catch (error) {
      logFailure("The extension's test could not start", error);
      notify({ tone: "error", title: t("cards.probe.failed.unexpected"), key: "probe" });
    } finally {
      setLaunching(null);
      read();
    }
  };

  const launchCardText = async () => {
    setLaunching("cardText");
    try {
      const outcome = await launchCardTextTest(t("card.notificationChannel"));
      if (outcome.status === "sent") {
        notify({ tone: "success", title: t("cards.probe.cardText.sent"), key: "probe" });
      } else {
        notify({
          tone: "error",
          title: t(`cards.probe.failed.${outcome.reason}`),
          body: outcome.detail ?? undefined,
          key: "probe"
        });
      }
    } catch (error) {
      logFailure("The card notification's test could not start", error);
      notify({ tone: "error", title: t("cards.probe.failed.unexpected"), key: "probe" });
    } finally {
      setLaunching(null);
    }
  };

  const copy = (text: string, done: string) => {
    const failed = () =>
      notify({ tone: "error", title: t("cards.probe.copyFailed"), key: "probe" });
    Clipboard.setStringAsync(text).then(
      (copied) => (copied ? notify({ tone: "success", title: done, key: "probe" }) : failed()),
      failed
    );
  };

  const balance = runs.find((run) => run.record?.balanceSats != null)?.record?.balanceSats;
  return (
    <ScrollView contentContainerStyle={styles.body} testID="probe-screen">
      <Lead>{t("cards.probe.intro")}</Lead>
      <Callout tone="warning" testID="probe-how">
        {t("cards.probe.how")}
      </Callout>

      <View style={styles.section}>
        <GroupLabel>{t("cards.probe.cardText.group")}</GroupLabel>
        <Text style={styles.note}>{t("cards.probe.cardText.intro")}</Text>
        <Button
          variant="secondary"
          size="md"
          loading={launching === "cardText"}
          disabled={launching !== null && launching !== "cardText"}
          onPress={() => void launchCardText()}
          testID="probe-card-text"
        >
          {t("cards.probe.cardText.launch")}
        </Button>
      </View>

      <View style={styles.section}>
        <GroupLabel>{t("cards.probe.launchGroup")}</GroupLabel>
        <SegmentedControl
          label={t("cards.probe.profile")}
          options={PROBE_PROFILES.map((value) => ({
            value,
            label: t(`cards.probe.profiles.${value}`)
          }))}
          value={profile}
          onChange={launching ? () => undefined : setProfile}
          testID="probe-profile"
        />
        {PROBE_MODES.map((mode) => (
          <Button
            key={mode}
            variant="secondary"
            size="md"
            loading={launching === mode}
            disabled={
              (launching !== null && launching !== mode) ||
              (mode === "pay" && lightningAddress === null)
            }
            onPress={() => void launch(mode)}
            testID={`probe-launch-${mode}`}
          >
            {t(`cards.probe.modes.${mode}`)}
          </Button>
        ))}
        {lightningAddress === null ? (
          <Text style={styles.note} testID="probe-no-address">
            {t("cards.probe.noPointOfSale")}
          </Text>
        ) : null}
        {balance != null ? (
          <Text style={styles.note} testID="probe-balance">
            {t("cards.probe.balance", { sats: formatInteger(balance, languageTag) })}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <GroupLabel>{t("cards.probe.resultsGroup")}</GroupLabel>
        {runs.length === 0 ? (
          <Text style={styles.note} testID="probe-empty">
            {t("cards.probe.empty")}
          </Text>
        ) : (
          <SettingsCard>
            {runs.map((run, index) => (
              <RunRow
                key={run.run}
                run={run}
                t={t}
                languageTag={languageTag}
                now={now}
                separated={index < runs.length - 1}
                onCopyInvoice={(invoice) => copy(invoice, t("cards.probe.invoiceCopied"))}
              />
            ))}
          </SettingsCard>
        )}
      </View>

      <Button
        icon="copy-regular"
        disabled={runs.length === 0}
        onPress={() => copy(probeReport(runs, new Date()), t("cards.probe.copied"))}
        testID="probe-copy"
      >
        {t("cards.probe.copy")}
      </Button>
      {runs.length > 0 ? (
        <Button
          variant="text"
          onPress={() => {
            clearProbeRuns();
            read();
          }}
          testID="probe-clear"
        >
          {t("cards.probe.clear")}
        </Button>
      ) : null}
    </ScrollView>
  );
}

/** Past this, a run still "running" was ended by the system: iOS gives an extension ~30 s. */
const RUN_LIMIT_MS = 45_000;
/** Past this, a notification without a record never reached the extension, or never ran it. */
const NO_RESULT_MS = 120_000;

/**
 * What a run's result says on one line: its outcome and the step it stopped at, at `now`. A run
 * still "running" past RUN_LIMIT_MS was stopped without a word (its record written at each step and
 * on expiry: the system ended its process, most likely for its memory).
 */
export function runOutcome(run: ProbeRun, t: TFunction, now: number): string {
  const record = run.record;
  if (!record) {
    const late = run.sentAt !== null && now - run.sentAt > NO_RESULT_MS;
    return t(late ? "cards.probe.outcome.none" : "cards.probe.outcome.waiting");
  }
  const step = record.failedStep ?? record.steps[record.steps.length - 1]?.name ?? "?";
  if (record.outcome === "running") {
    const stopped = now - record.startedAt > RUN_LIMIT_MS;
    return t(stopped ? "cards.probe.outcome.stopped" : "cards.probe.outcome.running", { step });
  }
  return t(`cards.probe.outcome.${record.outcome}`, { step });
}

function RunRow({
  run,
  t,
  languageTag,
  now,
  separated,
  onCopyInvoice
}: {
  run: ProbeRun;
  t: TFunction;
  languageTag: string;
  now: number;
  separated: boolean;
  onCopyInvoice: (invoice: string) => void;
}) {
  const styles = useStyles();
  const record = run.record;
  const time = run.sentAt ?? record?.startedAt ?? null;
  const megabytes = (bytes: number) => formatDecimal(bytes / 1_048_576, 1, languageTag);
  const measures = record
    ? [
        t("cards.probe.peak", { mb: megabytes(record.peakFootprintBytes) }),
        record.limitEstimateBytes !== null
          ? t("cards.probe.limit", { mb: megabytes(record.limitEstimateBytes) })
          : null,
        record.totalMs !== null
          ? t("cards.probe.seconds", { s: formatDecimal(record.totalMs / 1000, 1, languageTag) })
          : null
      ]
        .filter((part) => part !== null)
        .join(" · ")
    : null;
  return (
    <View style={[styles.run, separated && styles.separated]} testID={`probe-run-${run.run}`}>
      <View style={styles.runHead}>
        <Text style={styles.runLabel}>
          {`${t(`cards.probe.modes.${run.mode}`)} · ${t(`cards.probe.profiles.${run.profile}`)}`}
        </Text>
        <Text style={styles.runOutcome}>{runOutcome(run, t, now)}</Text>
      </View>
      {time !== null ? (
        <Text style={styles.note}>
          {formatDate(new Date(time), languageTag, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
        </Text>
      ) : null}
      {measures ? <Text style={styles.measures}>{measures}</Text> : null}
      {record?.error ? <Text style={styles.measures}>{record.error}</Text> : null}
      {record?.invoice ? (
        <Button
          variant="text"
          size="sm"
          fullWidth={false}
          icon="copy-regular"
          onPress={() => onCopyInvoice(record.invoice as string)}
          testID={`probe-invoice-${run.run}`}
        >
          {t("cards.probe.copyInvoice")}
        </Button>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[5] },
  section: { gap: space[3] },
  note: { ...sans(500), fontSize: type.meta, color: colors.text.secondary },
  run: { paddingHorizontal: space[5], paddingVertical: space[4], gap: space[1] },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  runHead: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  runLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    flexShrink: 1
  },
  runOutcome: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  measures: { ...mono(500), fontSize: type.meta, color: colors.text.secondary }
}));
