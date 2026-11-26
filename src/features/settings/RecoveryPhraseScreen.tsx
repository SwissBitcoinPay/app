import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead } from "@/components/ui/Heading";
import { subscribeAccount } from "@/features/account/session";
import {
  toUnlockFailure,
  unlockFailureMessage,
  type UnlockFailure
} from "@/features/account/usePasskeyAccount";
import { NoRecoveryPhraseError, revealRecoveryPhrase } from "@/features/account/wallet-access";
import { PosFrame } from "@/features/terminal/PosFrame";
import { logFailure } from "@/lib/log/log";
import { gutter, makeStyles, mono, proseLineHeight, radius, space, type } from "@/theme";

import { shieldScreen, unshieldScreen } from "./screen-shield";

type RevealFailure = UnlockFailure | "noPhrase";

type PhraseView =
  | { phase: "intro"; failure: RevealFailure | null }
  | { phase: "asking" }
  /** `shielded`: screen capture blocked (screen-shield.ts). */
  | { phase: "shown"; words: string[]; shielded: boolean };

/**
 * "Recovery phrase" of "Settings" (built as "Settings"'s sub-screens). The warnings first; then,
 * on "Show the phrase",
 * the passkey (revealRecoveryPhrase: the open account's, as before a payment) and the words, with
 * screen capture blocked (on the app; the web says it cannot).
 * Never copied (no button, words not selectable), logged nor
 * kept: the words leave the state as soon as they no longer show ("Hide", the screen left,
 * the app not active, the account closed); "Show the phrase" asks for the passkey again.
 */
export function RecoveryPhraseScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const focused = useIsFocused();
  const [view, setView] = useState<PhraseView>({ phase: "intro", failure: null });
  // Refs: a double tap asks for one passkey; an answer that comes once the phrase must no longer
  // show (any hide since the tap) shows nothing.
  const running = useRef(false);
  const visit = useRef(0);
  const active = useRef(false);
  // Whether the words show now (the state, for the listeners below).
  const showing = useRef(false);

  const hide = () => {
    visit.current++;
    showing.current = false;
    setView({ phase: "intro", failure: null });
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  useEffect(() => {
    if (!focused) return;
    active.current = true;
    return () => {
      active.current = false;
      hide();
    };
  }, [focused]);

  useEffect(() => {
    // The app switcher, a call, Control Center (iOS "inactive"), the background: hidden. Not
    // while the passkey is asked: its system prompt makes the app inactive (iOS) or puts it in the
    // background (Android); words that come then show under the blocked capture (screen-shield.ts).
    const state = AppState.addEventListener("change", (next) => {
      if (next !== "active" && showing.current) hide();
    });
    // Till mode, or another account: hidden.
    const account = subscribeAccount(hide);
    return () => {
      state.remove();
      account();
    };
  }, []);

  const reveal = async () => {
    if (running.current) return;
    running.current = true;
    const shown = ++visit.current;
    setView({ phase: "asking" });
    try {
      const words = await revealRecoveryPhrase();
      const shielded = await shieldScreen();
      if (shown !== visit.current || !active.current) {
        await unshieldScreen();
        return;
      }
      showing.current = true;
      setView({ phase: "shown", words, shielded });
    } catch (error) {
      if (shown !== visit.current) return;
      // Never the words: the errors of the passkey and the account carry none.
      logFailure("Revealing the recovery phrase failed", error);
      setView({
        phase: "intro",
        failure: error instanceof NoRecoveryPhraseError ? "noPhrase" : toUnlockFailure(error)
      });
    } finally {
      running.current = false;
    }
  };

  return (
    <PosFrame
      title={t("settings.recovery.title")}
      desktopTitle={t("settings.recovery.title")}
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: "recovery-back"
      }}
      // Over the whole window, without the side bar: its own way back (as advanced.tsx).
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID="recovery-back-desktop"
        >
          {t("common.back")}
        </Button>
      }
    >
      <ScrollView
        contentContainerStyle={[styles.body, desktop && styles.desktopBody]}
        testID="recovery-screen"
      >
        {view.phase === "shown" ? (
          <>
            <Lead>{t("settings.recovery.shownNote")}</Lead>
            {view.shielded ? null : (
              <Callout tone="warning" testID="recovery-capture-open">
                {t("settings.recovery.captureOpen")}
              </Callout>
            )}
            <PhraseWords words={view.words} columns={desktop ? 3 : 2} />
            <Button variant="secondary" icon="eye-slash" onPress={hide} testID="recovery-hide">
              {t("settings.recovery.hide")}
            </Button>
          </>
        ) : (
          <>
            <Lead>{t("settings.recovery.lead")}</Lead>
            <Callout tone="warning" title={t("settings.recovery.rulesTitle")}>
              {t("settings.recovery.rules")}
            </Callout>
            {view.phase === "intro" && view.failure ? (
              <Callout tone="error" testID="recovery-failure">
                {view.failure === "noPhrase"
                  ? t("settings.recovery.noPhrase")
                  : unlockFailureMessage(view.failure, t)}
              </Callout>
            ) : null}
            <Button
              icon="key"
              loading={view.phase === "asking"}
              onPress={() => void reveal()}
              testID="recovery-reveal"
            >
              {t("settings.recovery.reveal")}
            </Button>
          </>
        )}
      </ScrollView>
    </PosFrame>
  );
}

/**
 * The words, numbered, in reading order (row by row). Mounted only while they show: unmounted,
 * screen capture goes again. Not selectable: nothing offers to copy them.
 */
function PhraseWords({ words, columns }: { words: readonly string[]; columns: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  useEffect(
    () => () => {
      void unshieldScreen();
    },
    []
  );
  return (
    <View style={styles.grid} testID="recovery-words">
      {words.map((word, index) => (
        <View
          key={index}
          style={[styles.cell, { width: `${100 / columns}%` }]}
          accessible
          accessibilityLabel={t("settings.recovery.wordLabel", { index: index + 1, word })}
        >
          <Text selectable={false} style={styles.index}>
            {index + 1}
          </Text>
          <Text selectable={false} style={styles.word} testID={`recovery-word-${index + 1}`}>
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  body: {
    paddingHorizontal: gutter,
    paddingTop: space[4],
    paddingBottom: space[6],
    gap: space[5]
  },
  desktopBody: { maxWidth: 640 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    paddingVertical: space[2]
  },
  cell: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingHorizontal: space[4],
    paddingVertical: 10,
    minHeight: 44
  },
  index: {
    ...mono(500),
    minWidth: 22,
    textAlign: "right",
    fontSize: type.label,
    color: colors.text.secondary
  },
  word: {
    ...mono(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.primary
  }
}));
