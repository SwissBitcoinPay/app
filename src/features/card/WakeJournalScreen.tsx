import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead } from "@/components/ui/Heading";
import { Switch } from "@/components/ui/Switch";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { GroupLabel, SettingsCard, SettingsRow } from "@/features/settings/parts";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import {
  cardSocketStatus,
  openCardSocketBatterySettings,
  openCardSocketNotificationSettings,
  type CardSocketConnection,
  type CardSocketStatus
} from "@/lib/card/card-socket";
import {
  NewerCardWakesError,
  clearCardWakes,
  loadCardWakes,
  type CardWakeEntry
} from "@/lib/card/wake-journal";
import { formatDate } from "@/lib/locale/date";
import { formatDecimal } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { gutter, makeStyles, mono, sans, space, tracked, type } from "@/theme";

import {
  LONG_SILENCE_MS,
  cardWakesReport,
  deliveryMs,
  longestSilenceMs,
  wakeJournalShown,
  wakeOutcome,
  type WakeOutcome
} from "./wake-report";
import { cardSocketOffered } from "./socket";
import { switchCardSocket } from "./sync";

/**
 * "Wake journal" (staging on Android): the card socket (socket.ts), turned on and off here, its
 * connections as they go; the card wakes' journal (wake-journal.ts), and "Copy the journal" to hand
 * it over. Technical measures, for the team.
 */
export function WakeJournalScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  return (
    <PosFrame
      title={t("cards.wakes.title")}
      desktopTitle={t("cards.wakes.title")}
      leading={{ icon: "arrow-left", label: t("common.back"), onPress: back, testID: "wakes-back" }}
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID="wakes-back-desktop"
        >
          {t("common.back")}
        </Button>
      }
      flush="mobile"
    >
      {wakeJournalShown() ? (
        <JournalBody />
      ) : (
        <View style={styles.body}>
          <Lead>{t("cards.wakes.unavailable")}</Lead>
        </View>
      )}
    </PosFrame>
  );
}

/** How often the screen reads the journal while it shows: a wake's task writes it as it goes. */
const READ_INTERVAL_MS = 2_000;

type JournalView =
  | { phase: "loading" }
  | {
      phase: "ready";
      wakes: CardWakeEntry[];
      /** When it was read: an outcome depends on a wake's age. */
      now: number;
      /** Null where the card socket is not offered. */
      socket: CardSocketStatus | null;
    }
  | { phase: "failed"; reason: "newer" | "failed" };

async function readJournal(): Promise<JournalView> {
  try {
    const wakes = await loadCardWakes();
    const socket = cardSocketOffered() ? cardSocketStatus() : null;
    return { phase: "ready", wakes, now: Date.now(), socket };
  } catch (error) {
    logFailure("Reading the card wakes' journal failed", error);
    return { phase: "failed", reason: error instanceof NewerCardWakesError ? "newer" : "failed" };
  }
}

function JournalBody() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { languageTag } = usePos();
  const [view, setView] = useState<JournalView>({ phase: "loading" });
  // Each clearing starts the reads again: one begun before it never shows the wakes cleared.
  const [clearings, setClearings] = useState(0);

  useEffect(() => {
    let current = true;
    const read = () => {
      void readJournal().then((next) => {
        if (current) setView(next);
      });
    };
    read();
    const timer = setInterval(read, READ_INTERVAL_MS);
    // Back from the lock screen, where the card paid.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => {
      current = false;
      clearInterval(timer);
      appState.remove();
    };
  }, [clearings]);

  if (view.phase === "loading") return null;
  if (view.phase === "failed") {
    return (
      <View style={styles.body}>
        <Callout tone="error" testID="wakes-failed">
          {t(`cards.wakes.${view.reason}`)}
        </Callout>
      </View>
    );
  }

  const copy = () => {
    const failed = () =>
      notify({ tone: "error", title: t("cards.wakes.copyFailed"), key: "wakes" });
    const report = cardWakesReport(view.wakes, view.socket, new Date());
    Clipboard.setStringAsync(report).then(
      (copied) =>
        copied
          ? notify({ tone: "success", title: t("cards.wakes.copied"), key: "wakes" })
          : failed(),
      failed
    );
  };

  const clear = () => {
    clearCardWakes()
      .catch((error: unknown) => {
        logFailure("Clearing the card wakes' journal failed", error);
      })
      .finally(() => setClearings((count) => count + 1));
  };

  return (
    <ScrollView contentContainerStyle={styles.body} testID="wakes-screen">
      <Lead>{t("cards.wakes.intro")}</Lead>
      <Callout tone="warning" testID="wakes-how">
        {t("cards.wakes.how")}
      </Callout>
      {view.socket ? (
        <SocketSection
          socket={view.socket}
          languageTag={languageTag}
          now={view.now}
          onChanged={() => setClearings((count) => count + 1)}
        />
      ) : null}

      <View style={styles.section}>
        <GroupLabel>{t("cards.wakes.group")}</GroupLabel>
        {view.wakes.length === 0 ? (
          <Text style={styles.note} testID="wakes-empty">
            {t("cards.wakes.empty")}
          </Text>
        ) : (
          <SettingsCard>
            {view.wakes.map((wake, index) => (
              <WakeRow
                key={wake.id}
                wake={wake}
                t={t}
                languageTag={languageTag}
                now={view.now}
                separated={index < view.wakes.length - 1}
              />
            ))}
          </SettingsCard>
        )}
      </View>

      <Button
        icon="copy-regular"
        disabled={view.wakes.length === 0}
        onPress={copy}
        testID="wakes-copy"
      >
        {t("cards.wakes.copy")}
      </Button>
      {view.wakes.length > 0 ? (
        <Button variant="text" onPress={clear} testID="wakes-clear">
          {t("cards.wakes.clear")}
        </Button>
      ) : null}
    </ScrollView>
  );
}

/** What a wake's outcome says on one line. */
export function outcomeText(outcome: WakeOutcome, t: TFunction): string {
  switch (outcome.kind) {
    case "notTaken":
    case "paid":
    case "pending":
    case "declined":
      return t(`cards.wakes.outcome.${outcome.kind}`);
    case "failed":
      return t("cards.wakes.outcome.failed", { reason: outcome.reason });
    default:
      return t(`cards.wakes.outcome.${outcome.kind}`, { step: outcome.step });
  }
}

/**
 * The card socket (socket.ts): on (the default) and off, each relay's connection as the service
 * holds it, the battery optimisation Android applies to the app (which the holder may turn off for
 * it), and its notification (which the holder may hide). Turning it on or off syncs the cards at
 * once: their channels take the listening token's hash, or lose it, and the service its relays.
 */
function SocketSection({
  socket,
  languageTag,
  now,
  onChanged
}: {
  socket: CardSocketStatus;
  languageTag: string;
  now: number;
  onChanged: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [busy, setBusy] = useState(false);

  const toggle = (on: boolean) => {
    setBusy(true);
    switchCardSocket(on, t)
      .catch((error: unknown) => {
        logFailure("Turning the card socket on or off failed", error);
        notify({ tone: "error", title: t("cards.socket.failed"), key: "socket" });
      })
      .finally(() => {
        setBusy(false);
        onChanged();
      });
  };

  const battery = () => {
    openCardSocketBatterySettings().catch((error: unknown) => {
      logFailure("Opening the battery settings failed", error);
    });
  };

  const notificationSettings = () => {
    openCardSocketNotificationSettings().catch((error: unknown) => {
      logFailure("Opening the card socket's notification settings failed", error);
    });
  };

  const service = socket.running
    ? t("cards.socket.service.running", { reason: socket.startReason ?? "?" })
    : socket.lastStartError
      ? t("cards.socket.service.error", { code: socket.lastStartError })
      : t("cards.socket.service.stopped");

  return (
    <View style={styles.section}>
      <GroupLabel>{t("cards.socket.group")}</GroupLabel>
      <SettingsCard>
        <SettingsRow
          icon="circle-nodes"
          label={t("cards.socket.row")}
          caption={t(socket.enabled ? "cards.socket.caption.on" : "cards.socket.caption.off")}
          trailing={
            <Switch
              value={socket.enabled}
              onValueChange={toggle}
              loading={busy}
              label={t("cards.socket.row")}
              testID="socket-switch"
            />
          }
          testID="socket-row"
        />
      </SettingsCard>
      <Text style={styles.note}>{t("cards.socket.intro")}</Text>
      {socket.enabled ? (
        <>
          <Text style={styles.measures} testID="socket-service">
            {[
              service,
              socket.lastDispatchError
                ? t("cards.socket.service.task", { code: socket.lastDispatchError })
                : null
            ]
              .filter((part) => part !== null)
              .join(" · ")}
          </Text>
          {/* The relays it is set to listen to, not its connections: those show only once the
              service ran in this process (not when Android refused to start it). */}
          {socket.relays.length === 0 ? (
            <Text style={styles.note} testID="socket-no-relay">
              {t("cards.socket.noRelay")}
            </Text>
          ) : (
            socket.connections.map((connection) => (
              <Text
                key={connection.host}
                style={styles.measures}
                testID={`socket-${connection.host}`}
              >
                {connectionText(connection, t, languageTag, now)}
              </Text>
            ))
          )}
        </>
      ) : null}
      <Text style={styles.note} testID="socket-battery">
        {t(
          socket.ignoringBatteryOptimizations
            ? "cards.socket.battery.exempt"
            : "cards.socket.battery.applied"
        )}
      </Text>
      <Button variant="text" onPress={battery} testID="socket-battery-settings">
        {t("cards.socket.battery.settings")}
      </Button>
      {/* Android shows the service's notification and will not let the app hide it: its holder may,
          in the channel's settings, once the service showed (before, Android would show it again). */}
      {socket.enabled && socket.notification !== "none" ? (
        <>
          <Text style={styles.note} testID="socket-notification">
            {t(
              socket.notification === "hidden"
                ? "cards.socket.notice.hidden"
                : "cards.socket.notice.shown"
            )}
          </Text>
          <Button
            variant="text"
            onPress={notificationSettings}
            testID="socket-notification-settings"
          >
            {t(
              socket.notification === "hidden"
                ? "cards.socket.notice.settings"
                : "cards.socket.notice.hide"
            )}
          </Button>
        </>
      ) : null}
    </View>
  );
}

/** One relay's connection on one line: its host, its state and since when, what it went through. */
function connectionText(
  connection: CardSocketConnection,
  t: TFunction,
  languageTag: string,
  now: number
): string {
  const seconds = (ms: number) => formatDecimal(Math.max(0, ms) / 1000, 0, languageTag);
  const since = formatDate(new Date(connection.stateSince), languageTag, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  return [
    connection.host,
    `${t(`cards.socket.state.${connection.state}`)} ${t("cards.socket.since", { time: since })}`,
    connection.lastMessageAt !== null
      ? t("cards.socket.lastMessage", { s: seconds(now - connection.lastMessageAt) })
      : null,
    `${t("cards.socket.opened", { count: connection.opened })}, ${t("cards.socket.failures", {
      count: connection.failures
    })}`,
    connection.lastFailure ? t("cards.socket.lastFailure", { code: connection.lastFailure }) : null,
    t("cards.socket.wakes", { count: connection.wakes })
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

function WakeRow({
  wake,
  t,
  languageTag,
  now,
  separated
}: {
  wake: CardWakeEntry;
  t: TFunction;
  languageTag: string;
  now: number;
  separated: boolean;
}) {
  const styles = useStyles();
  const seconds = (ms: number) => formatDecimal(ms / 1000, 1, languageTag);
  const silence = longestSilenceMs(wake);
  const measures = [
    t("cards.wakes.received", { s: seconds(deliveryMs(wake)) }),
    t("cards.wakes.js", { s: seconds(wake.jsAgeMs) }),
    silence >= LONG_SILENCE_MS ? t("cards.wakes.silence", { s: seconds(silence) }) : null
  ]
    .filter((part) => part !== null)
    .join(" · ");
  // The steps as written, codes untranslated: what the team reads.
  const timeline = [
    ...wake.steps.map(
      ({ name, atMs, detail }) => `${name}${detail ? `(${detail})` : ""} ${seconds(atMs)}`
    ),
    ...(wake.tapCheck ? [`tap(${wake.tapCheck})`] : [])
  ].join(" · ");
  return (
    <View style={[styles.wake, separated && styles.separated]} testID={`wake-${wake.id}`}>
      <View style={styles.wakeHead}>
        <Text style={styles.wakeTime}>
          {formatDate(new Date(wake.startedAt), languageTag, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
        </Text>
        <Text style={styles.wakeOutcome}>{outcomeText(wakeOutcome(wake, now), t)}</Text>
      </View>
      <Text style={styles.measures}>{measures}</Text>
      {timeline ? <Text style={styles.measures}>{timeline}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[5] },
  section: { gap: space[3] },
  note: { ...sans(500), fontSize: type.meta, color: colors.text.secondary },
  wake: { paddingHorizontal: space[5], paddingVertical: space[4], gap: space[1] },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  wakeHead: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  wakeTime: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    flexShrink: 1
  },
  wakeOutcome: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  measures: { ...mono(500), fontSize: type.meta, color: colors.text.secondary }
}));
