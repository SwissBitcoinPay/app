import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { getAccountSeed, updateAccount } from "@/features/account/session";
import { shieldScreen, unshieldScreen } from "@/features/settings/screen-shield";
import { PosFrame } from "@/features/terminal/PosFrame";
import { BIP39_ENGLISH } from "@/lib/breez/bip39-english";
import { recoveryPhraseOf } from "@/lib/breez/seed";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { gutter, makeStyles, mono, radius, sans, space, type, useTheme } from "@/theme";

import { daysLeft, verifiedCheck } from "./policy";
import { useRecoveryCheckState } from "./RecoveryCheckBanner";

/** Words of the app's recovery phrase. */
const WORDS = 12;
/** List words offered under the field, at most. */
const SUGGESTIONS = 4;
const KNOWN = new Set(BIP39_ENGLISH);

type Phase =
  | { name: "intro" }
  | { name: "word"; index: number }
  | { name: "checking" }
  | { name: "done" }
  | { name: "wrong" }
  /** The words are right, their check not saved (the relays, the device's storage). */
  | { name: "saveFailed" };

/**
 * "Check your 12 words" (an illustrated explanation, then an input of one word at a time). The
 * words are
 * typed back from the owner's sheet, each one of the list (the words of the list that start as
 * typed are offered: they tell nothing of the right one), and checked only once all 12 are typed:
 * a mistake is not said word by word, the sheet is what is checked. Right, the check is saved with
 * the account's settings (policy.ts verifiedCheck): the banner goes, the payments are no longer
 * blocked, on all the owner's devices. "I no longer have them" opens "Recovery phrase" (the
 * passkey asked), to note them again, then come back here. Screen capture blocked while it shows,
 * the words forgotten once checked or the screen left.
 */
export function RecoveryCheckScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const desktop = useIsDesktop();
  const focused = useIsFocused();
  const { state, now } = useRecoveryCheckState();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [words, setWords] = useState<string[]>(() => Array<string>(WORDS).fill(""));
  // A ref: a double tap checks once.
  const checking = useRef(false);

  useEffect(() => {
    if (!focused) return;
    void shieldScreen();
    return () => {
      void unshieldScreen();
      // Left: the words typed go.
      setWords(Array<string>(WORDS).fill(""));
      setPhase((current) => (current.name === "word" ? { name: "intro" } : current));
    };
  }, [focused]);

  const back = () => {
    if (phase.name === "word" && phase.index > 0) {
      setPhase({ name: "word", index: phase.index - 1 });
      return;
    }
    if (phase.name === "word") {
      setPhase({ name: "intro" });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };
  const lost = () => router.push("/settings/recovery");

  const save = async () => {
    try {
      await updateAccount((settings) => ({
        recoveryCheck: verifiedCheck(settings.recoveryCheck, nowUnix())
      }));
      setPhase({ name: "done" });
    } catch (error) {
      logFailure("Saving the check of the recovery phrase failed", error);
      setPhase({ name: "saveFailed" });
    }
  };

  const check = async (typed: readonly string[]) => {
    if (checking.current) return;
    checking.current = true;
    setPhase({ name: "checking" });
    try {
      const seed = getAccountSeed();
      const expected = seed ? recoveryPhraseOf(seed) : null;
      // As WordStep accepts them: a capital or a space a keyboard added is no mistake.
      const words = typed.map((word) => word.trim().toLowerCase());
      const right =
        expected !== null &&
        expected.length === words.length &&
        expected.every((word, index) => word === words[index]);
      // Forgotten at once, right or wrong.
      setWords(Array<string>(WORDS).fill(""));
      if (!right) {
        setPhase({ name: "wrong" });
        return;
      }
      await save();
    } finally {
      checking.current = false;
    }
  };

  let body;
  if (phase.name === "word") {
    body = (
      <WordStep
        index={phase.index}
        value={words[phase.index] ?? ""}
        onChange={(value) =>
          setWords((current) => current.map((word, at) => (at === phase.index ? value : word)))
        }
        onNext={() => {
          if (phase.index < WORDS - 1) setPhase({ name: "word", index: phase.index + 1 });
          else void check(words);
        }}
        onLost={lost}
      />
    );
  } else if (phase.name === "checking") {
    body = <WaitingIndicator label={t("recoveryCheck.checking")} />;
  } else if (phase.name === "done") {
    body = (
      <View style={styles.section} testID="recovery-check-done">
        <Callout tone="success" title={t("recoveryCheck.done.title")}>
          {t("recoveryCheck.done.lead")}
        </Callout>
        <Button onPress={back} testID="recovery-check-finish">
          {t("recoveryCheck.done.finish")}
        </Button>
      </View>
    );
  } else if (phase.name === "wrong") {
    body = (
      <View style={styles.section} testID="recovery-check-wrong">
        <Callout tone="error" title={t("recoveryCheck.wrong.title")}>
          {t("recoveryCheck.wrong.lead")}
        </Callout>
        <Button onPress={() => setPhase({ name: "word", index: 0 })} testID="recovery-check-again">
          {t("recoveryCheck.wrong.again")}
        </Button>
        <Button variant="text" size="md" onPress={lost} testID="recovery-check-lost">
          {t("recoveryCheck.lost")}
        </Button>
      </View>
    );
  } else if (phase.name === "saveFailed") {
    body = (
      <View style={styles.section} testID="recovery-check-save-failed">
        <Callout tone="error">{t("recoveryCheck.saveFailed")}</Callout>
        <Button onPress={() => void save()} testID="recovery-check-save-retry">
          {t("recoveryCheck.retry")}
        </Button>
      </View>
    );
  } else {
    body = (
      <View style={styles.section} testID="recovery-check-intro">
        <ScreenTitle size={22}>{t("recoveryCheck.intro.title")}</ScreenTitle>
        <View style={styles.cases}>
          <CaseTile icon="mobile-screen-button" label={t("recoveryCheck.intro.lost")} />
          <CaseTile icon="fingerprint" label={t("recoveryCheck.intro.passkey")} />
          <CaseTile icon="store" label={t("recoveryCheck.intro.gone")} />
        </View>
        <Lead>{t("recoveryCheck.intro.lead")}</Lead>
        <Lead>{t("recoveryCheck.intro.key")}</Lead>
        {state.kind === "overdue" ? (
          <Callout tone="error" testID="recovery-check-overdue">
            {t("recoveryCheck.intro.overdue")}
          </Callout>
        ) : state.kind === "due" ? (
          <Callout tone="warning" icon="clock-regular" testID="recovery-check-due">
            {t("recoveryCheck.intro.due", { count: daysLeft(state.endsAt, now) })}
          </Callout>
        ) : (
          // Nothing due (under the threshold, or checked within the year; its invitation tapped):
          // good practice only.
          <Callout tone="success" testID="recovery-check-optional">
            {t("recoveryCheck.intro.optional")}
          </Callout>
        )}
        <Button
          icon="arrow-right"
          onPress={() => setPhase({ name: "word", index: 0 })}
          testID="recovery-check-start"
        >
          {t("recoveryCheck.intro.start")}
        </Button>
        <Button variant="text" size="md" onPress={lost} testID="recovery-check-lost">
          {t("recoveryCheck.lost")}
        </Button>
      </View>
    );
  }

  return (
    <PosFrame
      title={t("recoveryCheck.title")}
      desktopTitle={t("recoveryCheck.title")}
      leading={{
        icon: "arrow-left",
        label: phase.name === "word" ? t("recoveryCheck.word.previous") : t("common.back"),
        onPress: back,
        testID: "recovery-check-back"
      }}
      desktopAside={
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-left"
          fullWidth={false}
          onPress={back}
          testID="recovery-check-back-desktop"
        >
          {phase.name === "word" ? t("recoveryCheck.word.previous") : t("common.back")}
        </Button>
      }
    >
      <ScrollView
        contentContainerStyle={[styles.body, desktop && styles.desktopBody]}
        keyboardShouldPersistTaps="handled"
        testID="recovery-check-screen"
      >
        {body}
      </ScrollView>
    </PosFrame>
  );
}

/** One of the explanation's cases: what is lost, struck through. */
function CaseTile({ icon, label }: { icon: IconName; label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.case}>
      <View style={styles.caseIcon} accessibilityElementsHidden importantForAccessibility="no">
        <Icon name={icon} size={24} color={colors.text.primary} />
        <View style={styles.strike} />
      </View>
      <Text style={styles.caseLabel}>{label}</Text>
    </View>
  );
}

/** The input: one word, its place among the 12, the words of the list it may be. */
function WordStep({
  index,
  value,
  onChange,
  onNext,
  onLost
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onLost: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const word = value.trim().toLowerCase();
  const known = KNOWN.has(word);
  const suggestions =
    word.length >= 2 && !known
      ? BIP39_ENGLISH.filter((candidate) => candidate.startsWith(word)).slice(0, SUGGESTIONS)
      : [];
  const last = index === WORDS - 1;
  return (
    <View style={styles.section} testID={`recovery-check-word-${index + 1}`}>
      <Text style={styles.progressText}>
        {t("recoveryCheck.word.progress", { index: index + 1 })}
      </Text>
      <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no">
        {Array.from({ length: WORDS }, (_, at) => (
          <View
            key={at}
            style={[
              styles.segment,
              at < index ? styles.segmentDone : at === index ? styles.segmentCurrent : null
            ]}
          />
        ))}
      </View>
      <TextField
        label={t("recoveryCheck.word.label", { index: index + 1 })}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        // Android's keyboards learn and suggest what is typed, but in a password's field.
        keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
        autoFocus
        error={
          word.length > 0 && suggestions.length === 0 && !known
            ? t("recoveryCheck.word.unknown")
            : null
        }
        testID="recovery-check-word"
      />
      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((candidate) => (
            <Button
              key={candidate}
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => onChange(candidate)}
              testID={`recovery-check-suggestion-${candidate}`}
            >
              {candidate}
            </Button>
          ))}
        </View>
      ) : null}
      <Text style={styles.hint}>{t("recoveryCheck.word.hint")}</Text>
      <Button
        icon={last ? "circle-check" : "arrow-right"}
        disabled={!known}
        onPress={onNext}
        testID="recovery-check-next"
      >
        {last ? t("recoveryCheck.word.check") : t("recoveryCheck.word.next")}
      </Button>
      <Button variant="text" size="md" onPress={onLost} testID="recovery-check-lost">
        {t("recoveryCheck.lost")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  body: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[8] },
  desktopBody: { maxWidth: 640 },
  section: { gap: 16 },
  cases: { flexDirection: "row", gap: 8 },
  case: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: space[5],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  caseIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  strike: {
    position: "absolute",
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.danger.solid,
    transform: [{ rotate: "-45deg" }]
  },
  caseLabel: {
    ...sans(600),
    fontSize: type.caption,
    lineHeight: type.caption * 1.35,
    color: colors.text.primary,
    textAlign: "center"
  },
  progressText: { ...mono(500), fontSize: type.caption, color: colors.text.secondary },
  progress: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border.subtle },
  segmentDone: { backgroundColor: colors.background.accent },
  segmentCurrent: { backgroundColor: colors.text.primary },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
