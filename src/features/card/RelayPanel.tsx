import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CARD_RELAY_SOURCE_URL, DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import type { CardState } from "@/lib/card/card-record";
import { MAX_RELAY_HOST_LENGTH, fitsInCard } from "@/lib/card/card-url";
import { canonicalRelayHost } from "@/lib/card/relay-host";
import { logFailure } from "@/lib/log/log";
import { openSystemSettings } from "@/lib/system-ui";
import {
  makeStyles,
  palette,
  proseLineHeight,
  radius,
  sans,
  space,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import type { PairingFailure } from "./pairing";
import { cardPushToken, notificationsAllowed, notificationsAskable } from "./push";
import type { ChannelSync } from "./relay-sync";
import { checkCardChannel } from "./sync";
import type { RelayMove } from "./useRelayMove";

/*
 * "Relay and programming" of a card: its state first. Ready, it says so; else "Card status" says
 * what does not work (the relay, the card's channel there, this phone woken), the fix first. Then
 * "Change relay", shown as it is: the panel is reached from "Advanced settings" already. The state
 * is checked as the panel opens (the channel synced with its relay, sync.ts), never told from an
 * older sync alone. "Change relay" is its form: the address read, then the relay asked, before the
 * card is (useRelayMove.ts).
 */

/** The channel's state read for the panel: null while it is checked, `failed` when it could not be. */
type Checked = ChannelSync | "failed" | null;

/** The card's channel checked as the panel opens, and again on demand. */
function useRelayCheck(cardId: string) {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [checked, setChecked] = useState<{ round: number; sync: Checked; allowed: boolean }>({
    round: 0,
    sync: null,
    allowed: false
  });

  // Back from the system's settings ("Turn on notifications"): checked again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setRound((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      checkCardChannel(cardId, t("card.notificationChannel")).then(
        (sync): Checked => sync,
        (error: unknown): Checked => {
          logFailure("Checking a card's channel failed", error);
          return "failed";
        }
      ),
      notificationsAllowed()
    ]).then(([sync, allowed]) => {
      if (alive) setChecked({ round, sync, allowed });
    });
    return () => {
      alive = false;
    };
  }, [cardId, round, t]);

  const shown = checked.round === round ? checked : { round, sync: null, allowed: false };
  return { ...shown, recheck: () => setRound((value) => value + 1) };
}

/** A line of "Card status": what was checked, and whether it works. */
type Check = { key: string; ok: boolean; title: string; caption: string };

export function RelayStatus({ card, onChange }: { card: CardState; onChange: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { sync, allowed, recheck } = useRelayCheck(card.cardId);
  const [enabling, setEnabling] = useState(false);
  const ready = sync !== null && sync !== "failed" && sync.status === "ready";

  const host = card.relayHost;
  const relayCaption =
    host === DEFAULT_CARD_RELAY_HOST ? t("cards.relay.defaultCaption", { host }) : host;

  // Asked when the system may still ask; else its settings (back from them, checked again).
  const enable = () => {
    setEnabling(true);
    notificationsAskable()
      .then(async (askable) => {
        if (askable) await cardPushToken(t("card.notificationChannel"), { ask: true });
        else await openSystemSettings();
      })
      .catch((error: unknown) => logFailure("Allowing the notifications failed", error))
      .finally(() => {
        setEnabling(false);
        recheck();
      });
  };

  let checks: Check[] = [];
  let fix: { label: string; icon: IconName; onPress: () => void } | null = null;
  if (sync === "failed") {
    // The check itself failed (this phone offline, the account's relays).
    checks = [
      {
        key: "unknown",
        ok: false,
        title: t("cards.relay.uncheckedTitle"),
        caption: t("cards.relay.uncheckedCaption")
      }
    ];
    fix = { label: t("cards.retry"), icon: "arrows-rotate", onPress: recheck };
  } else if (sync !== null && sync.status !== "ready") {
    if (sync.status === "unreachable" || sync.status === "refused") {
      // The relay down, or refusing the card's channel.
      checks = [
        {
          key: "relay",
          ok: false,
          title: t(
            sync.status === "unreachable" ? "cards.relay.unreachable" : "cards.relay.refused"
          ),
          caption: t(
            sync.status === "unreachable"
              ? "cards.relay.unreachableCaption"
              : "cards.relay.refusedCaption",
            { host }
          )
        }
      ];
      fix = { label: t("cards.retry"), icon: "arrows-rotate", onPress: recheck };
    } else {
      checks = [
        { key: "relay", ok: true, title: t("cards.relay.reachable"), caption: relayCaption },
        {
          key: "card",
          ok: true,
          title: t("cards.relay.programmed"),
          caption: t("cards.relay.programmedCaption")
        },
        {
          key: "phone",
          ok: false,
          title: t("cards.relay.notWoken"),
          // Allowed, yet no way to wake this phone (no push token): the settings change nothing.
          caption: t(allowed ? "cards.relay.noTokenCaption" : "cards.relay.notWokenCaption")
        }
      ];
      fix = allowed
        ? null
        : { label: t("cards.relay.enableNotifications"), icon: "bell", onPress: enable };
    }
  }

  return (
    <View style={styles.content} testID="card-relay-status">
      {sync === null ? (
        // The state is checked before it is said.
        <View style={styles.waiting} testID="card-relay-checking">
          <Spinner size={20} />
          <Text style={styles.waitingText}>{t("cards.relay.checking")}</Text>
        </View>
      ) : ready ? (
        <View style={styles.ready} testID="card-relay-ready">
          <View style={styles.readyMark}>
            <Icon name="check" size={26} color={colors.success.fg} />
          </View>
          <Text accessibilityRole="header" style={styles.readyTitle}>
            {t("cards.relay.readyTitle")}
          </Text>
          <Text style={styles.readyText}>{t("cards.relay.readyBody", { host })}</Text>
        </View>
      ) : (
        <>
          <View style={styles.checksBlock}>
            <Text accessibilityRole="header" style={styles.checksLabel}>
              {t("cards.relay.stateTitle")}
            </Text>
            <View style={styles.checks} testID="card-relay-checks">
              {checks.map((check, index) => (
                <CheckRow key={check.key} check={check} separated={index < checks.length - 1} />
              ))}
            </View>
          </View>
          {fix ? (
            <Button
              icon={fix.icon}
              loading={enabling}
              onPress={fix.onPress}
              testID="card-relay-fix"
            >
              {fix.label}
            </Button>
          ) : null}
        </>
      )}
      <View style={styles.options}>
        <ListRow
          inset={16}
          cornerRadius={radius.lg}
          accessibilityRole="button"
          accessibilityLabel={`${t("cards.relay.change")}, ${t("cards.relay.changeCaption")}`}
          onPress={onChange}
          style={styles.option}
          testID="card-relay-change"
        >
          <View style={styles.optionIcon}>
            <Icon name="circle-nodes" size={15} color={colors.text.accent} />
          </View>
          <View style={styles.optionTexts}>
            <Text style={styles.optionTitle}>{t("cards.relay.change")}</Text>
            <Text style={styles.optionCaption}>{t("cards.relay.changeCaption")}</Text>
          </View>
          <Icon name="chevron-right" size={12} color={colors.text.tertiary} />
        </ListRow>
      </View>
    </View>
  );
}

function CheckRow({ check, separated }: { check: Check; separated: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`${check.title}, ${check.caption}`}
      style={[styles.check, separated && styles.checkSeparated]}
      testID={`card-relay-check-${check.key}`}
    >
      <View
        style={[
          styles.checkMark,
          { backgroundColor: check.ok ? colors.success.solid : colors.warning.solid }
        ]}
      >
        {check.ok ? (
          <Icon name="check" size={11} color={palette.white} />
        ) : (
          <Text style={styles.bang}>!</Text>
        )}
      </View>
      <View style={styles.checkTexts}>
        <Text style={styles.checkTitle}>{check.title}</Text>
        <Text
          style={[
            styles.checkCaption,
            { color: check.ok ? colors.text.secondary : colors.warning.fg }
          ]}
        >
          {check.caption}
        </Text>
      </View>
    </View>
  );
}

/**
 * A relay's host as the user types it: `https://` (the field's prefix) and a last `/` taken off,
 * anything else refused (another scheme, a path), then written as the card would (relay-host.ts).
 */
export function relayHostOf(text: string): string | null {
  const host = text
    .trim()
    .replace(/^https:\/\//i, "")
    .replace(/\/$/, "");
  return host.includes("/") ? null : canonicalRelayHost(host);
}

/** The address typed, read as the card would hold it: null when it is no relay's address. */
function readAddress(text: string): { host: string | null; error: "invalid" | "long" | null } {
  const host = relayHostOf(text);
  if (host === null) return { host: null, error: "invalid" };
  return fitsInCard(host) ? { host, error: null } : { host, error: "long" };
}

type FieldFailure =
  "cards.relay.fieldUnreachable" | "cards.relay.fieldIncompatible" | "cards.relay.fieldLong";

/** The failures of the move the field says: they are its address's. */
const FIELD_FAILURES: Partial<Record<PairingFailure, FieldFailure>> = {
  relayUnreachable: "cards.relay.fieldUnreachable",
  relayIncompatible: "cards.relay.fieldIncompatible",
  relayTooLong: "cards.relay.fieldLong"
};

/**
 * "Change relay": what a relay does and its source's link (to host one), then the field opened on
 * the card's relay, "Default relay" on its label row while it holds another address; every error
 * about the address inside it, once "Program the card" is pressed (not while it is typed), an edit
 * clearing it; a failure that is not the address's (NFC, notifications, the account's relays) above
 * the button (ErrorMessage).
 */
export function RelayChangeForm({
  card,
  move,
  onProgram,
  onEdit
}: {
  card: CardState;
  move: RelayMove;
  onProgram: (host: string) => void;
  /** The address changed: a refusal of the former one is forgotten. */
  onEdit: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [text, setText] = useState(card.relayHost);
  // The address's own error, said once "Program the card" was pressed for it.
  const [tried, setTried] = useState(false);
  const address = readAddress(text);
  const checking = move.phase === "checking";
  const refused = move.phase === "refused" ? move.reason : null;
  const fieldFailure = refused ? FIELD_FAILURES[refused] : undefined;
  const error =
    tried && address.error
      ? t(address.error === "invalid" ? "cards.relay.fieldInvalid" : "cards.relay.fieldLong", {
          max: MAX_RELAY_HOST_LENGTH
        })
      : fieldFailure
        ? t(fieldFailure, { max: MAX_RELAY_HOST_LENGTH })
        : null;
  // The shared texts speak of a pairing for a failure without a cause of its own.
  const failure =
    refused && !fieldFailure
      ? refused === "failed"
        ? t("cards.relay.steps.failed")
        : t(`card.failure.${refused}`)
      : null;
  // Nothing to program: no address, or the card's own relay.
  const idle = text.trim() === "" || address.host === card.relayHost;

  const edit = (next: string) => {
    setText(next);
    setTried(false);
    onEdit();
  };
  const program = () => {
    setTried(true);
    if (address.error === null && address.host !== null) onProgram(address.host);
  };

  return (
    <View style={styles.content} testID="card-relay-form">
      {/* The relay's source under what a relay does: what to run to host one of one's own. */}
      <View>
        <Text style={styles.prose}>{t("cards.sheet.relayHint")}</Text>
        <ExternalLink
          label={t("cards.relay.sourceLink")}
          url={CARD_RELAY_SOURCE_URL}
          testID="card-relay-source"
        />
      </View>
      <TextField
        label={t("cards.sheet.relayField")}
        labelAction={
          !checking && address.host !== DEFAULT_CARD_RELAY_HOST
            ? {
                label: t("cards.relay.defaultLink"),
                onPress: () => edit(DEFAULT_CARD_RELAY_HOST),
                testID: "card-relay-default"
              }
            : undefined
        }
        value={text}
        onChangeText={edit}
        prefix="https://"
        placeholder={t("cards.sheet.relayPlaceholder")}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="url"
        disabled={checking}
        error={error}
        testID="card-relay-field"
      />
      {failure ? <ErrorMessage testID="card-relay-failure">{failure}</ErrorMessage> : null}
      <Button
        icon="credit-card"
        disabled={idle}
        loading={checking}
        onPress={program}
        testID="card-relay-program"
      >
        {t("cards.sheet.program")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  content: { gap: space[6] },
  waiting: { alignItems: "center", gap: space[4], paddingVertical: space[6] },
  waitingText: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  ready: { alignItems: "center", gap: 8, paddingTop: 10, paddingBottom: 4 },
  readyMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success.bg,
    alignItems: "center",
    justifyContent: "center"
  },
  readyTitle: {
    ...sans(700),
    fontSize: 19,
    letterSpacing: tracking(TITLE_EM, 19),
    color: colors.text.primary
  },
  readyText: {
    ...sans(500),
    maxWidth: 300,
    textAlign: "center",
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text.secondary
  },
  checksBlock: { gap: 4 },
  checksLabel: { ...sans(600), fontSize: 12.5, color: colors.text.secondary },
  checks: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.app,
    paddingVertical: 6,
    paddingHorizontal: 16
  },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  checkSeparated: { borderBottomWidth: 1, borderBottomColor: colors.border.faint },
  checkMark: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  bang: { ...sans(700), fontSize: 13, lineHeight: 16, color: palette.white },
  checkTexts: { flex: 1, minWidth: 0, gap: 2 },
  checkTitle: { ...sans(600), fontSize: 14, color: colors.text.primary },
  checkCaption: { ...sans(500), fontSize: 12.5, lineHeight: 18 },
  options: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.background.surface,
    boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}`
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 72,
    paddingVertical: 12
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  optionTexts: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  optionCaption: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
  prose: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  }
}));
