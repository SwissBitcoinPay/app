import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { StateDot } from "@/components/ui/StateDot";
import { MAX_RELAYS, RELAY_TEST_TIMEOUT_MS } from "@/config/relays";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatDecimal, formatInteger } from "@/lib/locale/format";
import {
  mayBeOnLocalNetwork,
  normalizeRelayUrl,
  relayUrlError,
  sameRelayList,
  type RelayUrlError
} from "@/lib/relays/list";
import {
  cardInset,
  makeStyles,
  mono,
  type PaymentState,
  radius,
  sans,
  space,
  type ThemeColors,
  type,
  useTheme
} from "@/theme";

import {
  relayStatus,
  testRelays,
  testRelaysAskingAccess,
  timedOut,
  useLocalNetworkPermission,
  useRelayStatuses,
  useRelayTests,
  type RelayStatus,
  type RelayTest
} from "./relay-test";

/*
 * The list of relays as "Settings" edits it: a draft of the saved list, a
 * light per relay (relay-test.ts), the trash to remove one (never the last), an address to add
 * (`wss://` fixed, complete, not listed yet), "Test the connection" for all of them, and
 * "Save", greyed while the draft is the saved list, while a test runs and while a relay
 * is red. Shared by the mobile screen, the desktop dialog and
 * "Advanced settings" before the sign-in. On the web,
 * "Test the connection" first asks the browser for local network access when the list holds a
 * relay it may count as one of the local network (testRelaysAskingAccess), and while such a relay
 * is red, a note says how to allow it: in the site's settings once the browser blocks it, by
 * testing again while it can still ask. Under each address, its status in words and, once tested,
 * how long the relay took. A relay that refuses to give a key's records to another key
 * ("Reading refused", relay-test.ts) is red as an unreachable one, a note says why, and
 * "Save" first tests the relays not tested yet: a list holding one is never saved, its
 * points of sale, employees and payers could read nothing there.
 */

const LIGHT: Record<RelayStatus, PaymentState> = {
  reachable: "settled",
  untested: "underpaid",
  testing: "underpaid",
  unreachable: "canceled",
  restricted: "canceled"
};

/** Red: unreachable, or refusing the reads the app makes there. */
function isRed(status: RelayStatus): boolean {
  return status === "unreachable" || status === "restricted";
}

/**
 * A relay's light: green reachable, yellow not tested or being tested (pulsing), red unreachable or
 * restricted.
 */
export function RelayLight({ status }: { status: RelayStatus }) {
  const styles = useStyles();
  return (
    <StateDot
      state={LIGHT[status]}
      pulsing={status === "testing"}
      style={styles.light}
      testID={`relay-light-${status}`}
    />
  );
}

export type RelaysEditor = {
  draft: readonly string[];
  /** The relay's last test: its status and how long it took. */
  result: (relay: string) => RelayTest;
  /** Adds the address typed (with or without `wss://`): its error, or null once added. */
  add: (input: string) => RelayUrlError | "tooMany" | null;
  remove: (relay: string) => void;
  test: () => void;
  testing: boolean;
  /** A relay of the draft is red: "Save" waits for it to be removed. */
  unreachable: boolean;
  /** A relay of the draft refuses the reads the app makes there: a note says why it is red. */
  restricted: boolean;
  /**
   * Before "Save": tests the draft's relays not tested yet, and resolves with whether the
   * draft may be saved (every relay green). Never rejects.
   */
  check: () => Promise<boolean>;
  /**
   * Web: the browser blocks this site's access to the local network, and a relay it may count as
   * one of it is red: a note says where to allow it.
   */
  localNetworkBlocked: boolean;
  /**
   * Web: the browser may still ask for local network access (its request dismissed or left
   * unanswered, or the relay's name not resolving here to a local address: nothing tells them
   * apart), and a relay it may count as one of the local network is red: a note says to test again
   * and allow it, or else to check that this device is on the relay's network.
   */
  localNetworkNotAllowed: boolean;
  /** The draft is the saved list. */
  clean: boolean;
  /** "Save" is greyed. */
  blocked: boolean;
  full: boolean;
  /** Back to the saved list ("Cancel"). */
  reset: () => void;
};

/** A draft of `saved`, started again whenever `saved` changes (saved here or elsewhere). */
export function useRelaysEditor(saved: readonly string[]): RelaysEditor {
  const result = useRelayTests();
  const status = (relay: string) => result(relay).status;
  const localNetwork = useLocalNetworkPermission();
  const [draft, setDraft] = useState<{ from: readonly string[]; list: readonly string[] }>({
    from: saved,
    list: saved
  });
  const [testing, setTesting] = useState(false);
  // Another saved list (this screen saved it, another device changed it): the draft follows.
  const current = sameRelayList(draft.from, saved);
  if (!current) setDraft({ from: saved, list: saved });
  const list = current ? draft.list : saved;
  const unreachable = list.some((relay) => isRed(status(relay)));
  const restricted = list.some((relay) => status(relay) === "restricted");
  const localUnreachable =
    !testing && list.some((relay) => mayBeOnLocalNetwork(relay) && status(relay) === "unreachable");
  const clean = sameRelayList(list, saved);
  return {
    draft: list,
    // Each relay's own light, as soon as it answered (relay-test.ts), not all at the test's end.
    result,
    add: (input) => {
      const error = relayUrlError(input, list);
      if (error) return error;
      if (list.length >= MAX_RELAYS) return "tooMany";
      const url = normalizeRelayUrl(input)!;
      setDraft({ from: saved, list: [...list, url] });
      return null;
    },
    remove: (relay) => {
      if (list.length <= 1) return;
      setDraft({ from: saved, list: list.filter((other) => other !== relay) });
    },
    test: () => {
      if (testing) return;
      setTesting(true);
      void testRelaysAskingAccess(list).finally(() => setTesting(false));
    },
    check: async () => {
      // Tested in this launch, green or red: known. The others are tested now (a relay added, a
      // list never tested), as "Test the connection" does.
      const pending = list.filter((relay) => {
        const known = status(relay);
        return known !== "reachable" && !isRed(known);
      });
      if (pending.length > 0) {
        setTesting(true);
        try {
          await testRelaysAskingAccess(pending);
        } finally {
          setTesting(false);
        }
      }
      // The tests as they are now, not as this render saw them.
      return list.every((relay) => relayStatus(relay) === "reachable");
    },
    testing,
    unreachable: !testing && unreachable,
    restricted: !testing && restricted,
    localNetworkBlocked: localUnreachable && localNetwork === "denied",
    localNetworkNotAllowed: localUnreachable && localNetwork === "prompt",
    clean,
    blocked: clean || testing || unreachable,
    full: list.length >= MAX_RELAYS,
    reset: () => setDraft({ from: saved, list: saved })
  };
}

/** Tests `relays` once when shown (a read-only list, a summary), unless they were tested. */
export function useTestOnce(relays: readonly string[]): void {
  const status = useRelayStatuses();
  const untested = relays.filter((relay) => status(relay) === "untested");
  const key = untested.join(" ");
  useEffect(() => {
    if (key !== "") void testRelays(key.split(" "));
  }, [key]);
}

/** A delay as the relays' lines write it, in the device locale: "186 ms", "1,34 s". */
function formatDelay(ms: number, languageTag: string, t: TFunction): string {
  return ms < 1000
    ? t("relays.milliseconds", { value: formatInteger(ms, languageTag) })
    : t("relays.seconds", { value: formatDecimal(ms / 1000, 2, languageTag) });
}

/**
 * The line under a relay's address: "Connected · 186 ms", "Unreachable · no answer in 8 s"
 * (a failure sooner: "Unreachable"), "Reading refused", "Testing", "Not tested".
 */
function relayLine(test: RelayTest, languageTag: string, t: TFunction): string {
  const status = t(`relays.status.${test.status}`);
  if (test.status === "reachable" && test.elapsedMs !== null) {
    return t("relays.statusDetail", {
      status,
      detail: formatDelay(test.elapsedMs, languageTag, t)
    });
  }
  if (timedOut(test)) {
    return t("relays.statusDetail", {
      status,
      detail: t("relays.noAnswer", {
        duration: formatDelay(RELAY_TEST_TIMEOUT_MS, languageTag, t)
      })
    });
  }
  return status;
}

function lineColors(colors: ThemeColors): Record<RelayStatus, string> {
  return {
    reachable: colors.state.settled.fg,
    untested: colors.text.secondary,
    testing: colors.text.secondary,
    unreachable: colors.danger.fg,
    restricted: colors.danger.fg
  };
}

/**
 * The draft's relays, each with its light, its address (mono, cut at the end), its status and
 * delay under it, and its trash: `card` on mobile (rows of 64 in a card), `lines` in the desktop
 * dialog (rows of 60 between hairlines).
 */
export function RelayRows({
  editor,
  variant
}: {
  editor: RelaysEditor;
  variant: "card" | "lines";
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const one = editor.draft.length === 1;
  return (
    <View style={variant === "card" ? styles.card : styles.lines} testID="relay-rows">
      {editor.draft.map((relay, index) => {
        const test = editor.result(relay);
        const line = relayLine(test, languageTag, t);
        return (
          <View
            key={relay}
            style={[
              variant === "card" ? styles.cardRow : styles.lineRow,
              (variant === "lines" || index < editor.draft.length - 1) && styles.separated
            ]}
            accessible={false}
          >
            <View style={styles.texts}>
              <View style={styles.firstLine}>
                <RelayLight status={test.status} />
                <Text
                  numberOfLines={1}
                  style={styles.address}
                  accessibilityLabel={t("relays.statusLabel", { relay, status: line })}
                >
                  {relay}
                </Text>
              </View>
              {/* Read with the address (its label): hidden from screen readers. */}
              <Text
                numberOfLines={1}
                style={[styles.line, { color: lineColors(colors)[test.status] }]}
                aria-hidden
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                testID={`relay-line-${index}`}
              >
                {line}
              </Text>
            </View>
            <IconButton
              icon="trash-can"
              label={t("relays.removeLabel", { relay })}
              size={16}
              disabled={one}
              onPress={() => editor.remove(relay)}
              testID={`remove-relay-${index}`}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Under the list: why the trash or "Save" is greyed. */
export function RelayNotes({ editor }: { editor: RelaysEditor }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <>
      {editor.draft.length === 1 ? <Text style={styles.note}>{t("relays.keepOne")}</Text> : null}
      {editor.unreachable ? (
        <Text style={[styles.note, styles.noteDanger]} testID="relays-unreachable">
          {t("relays.removeUnreachable")}
        </Text>
      ) : null}
      {editor.restricted ? (
        <Text style={[styles.note, styles.noteDanger]} testID="relays-restricted">
          {t("relays.restrictedRelay")}
        </Text>
      ) : null}
      {editor.localNetworkBlocked ? (
        <Text style={[styles.note, styles.noteDanger]} testID="relays-local-network-blocked">
          {t("relays.localNetworkBlocked")}
        </Text>
      ) : null}
      {editor.localNetworkNotAllowed ? (
        <Text style={[styles.note, styles.noteDanger]} testID="relays-local-network-not-allowed">
          {t("relays.localNetworkNotAllowed")}
        </Text>
      ) : null}
    </>
  );
}

/**
 * A list shown, not edited (the summary of the desktop settings, an employee's list): on sand,
 * each relay with its light.
 */
export function ReadOnlyRelays({
  relays,
  rowHeight = 38,
  style,
  testID
}: {
  relays: readonly string[];
  rowHeight?: 38 | 28;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const status = useRelayStatuses();
  return (
    <View style={[styles.readOnly, style]} testID={testID}>
      {relays.map((relay) => (
        <View key={relay} style={[styles.readOnlyRow, { height: rowHeight }]}>
          <RelayLight status={status(relay)} />
          <Text
            numberOfLines={1}
            style={styles.address}
            accessibilityLabel={t("relays.statusLabel", {
              relay,
              status: t(`relays.status.${status(relay)}`)
            })}
          >
            {relay}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The message of an address that cannot be added, for the field. */
export function relayErrorKey(error: RelayUrlError | "tooMany"): string | null {
  switch (error) {
    case "empty":
      return null;
    case "incomplete":
      return "relays.errors.incomplete";
    case "duplicate":
      return "relays.errors.duplicate";
    case "local":
      return "relays.errors.local";
    case "tooMany":
      return "relays.tooMany";
  }
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  light: { width: 8, height: 8, borderRadius: 4 },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingLeft: cardInset,
    paddingRight: space[2]
  },
  lines: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingVertical: 10
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingVertical: 9,
    paddingLeft: 4
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  firstLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  // Under the address, past the light (8) and the gap (12).
  line: {
    ...sans(500),
    paddingLeft: 20,
    fontSize: type.caption
  },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  address: {
    ...mono(500),
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    color: colors.text.primary
  },
  note: {
    ...sans(500),
    paddingHorizontal: 4,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  noteDanger: { ...sans(600), color: colors.danger.fg },
  readOnly: {
    backgroundColor: colors.background.subtle,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 16
  },
  readOnlyRow: { flexDirection: "row", alignItems: "center", gap: 10 }
}));
