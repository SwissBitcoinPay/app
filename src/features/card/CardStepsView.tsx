import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import {
  gutter,
  makeStyles,
  palette,
  radius,
  sans,
  space,
  TITLE_EM,
  tracking,
  useTheme,
  type ThemeColors
} from "@/theme";

import { HoldStage } from "./HoldStage";

/*
 * The steps of an operation that needs the card held to the phone ("Change relay", "Add a card",
 * "Delete the card"): the card on its stage beside what to do now, then every step, each done, in
 * progress, failed or to come, then what can be done: finish, try again, do it another way, cancel.
 * A failed step says what to do about it, with the button that does it when there is one ("Open
 * settings"); the steps not reached then keep their title only. `centered` ("Card migration"): the
 * stage at its full size above the title, centred.
 */

/** `warning`: done, but not as it should (the former relay did not answer). */
export type CardStepState = "todo" | "running" | "card" | "done" | "failed" | "warning";

export type CardStepsAction = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  /** Waiting for what it started (the sign-up saved before it goes on). */
  loading?: boolean;
  /** Another button's wait. */
  disabled?: boolean;
  /** The button's own, where it is not the usual one ("Start": `add-card-start`). */
  testID?: string;
};

/**
 * What a step's title says in each of its states, so that it never says what the step has not
 * reached ("Balance transferred" while the balance is still on its way): what it will do ("Balance
 * transfer"), what it does ("Transferring the balance"), what it did ("Balance transferred"), what
 * it did not ("Balance not transferred").
 */
export type StepTitles = { todo: string; running: string; done: string; failed: string };

/**
 * The title of a step in its state: the hand (`card`) says what it does, the phone waiting for the
 * card; `warning` (done, not as it should) what it did, where the step gives no title of its own.
 */
export function stepTitle(titles: StepTitles, state: CardStepState): string {
  switch (state) {
    case "todo":
      return titles.todo;
    case "running":
    case "card":
      return titles.running;
    case "done":
    case "warning":
      return titles.done;
    case "failed":
      return titles.failed;
  }
}

export type CardStep = {
  key: string;
  /** Its title in each state (stepTitle). */
  titles: StepTitles;
  /**
   * Its own title in this state instead, saying more than `titles`: a failure's ("Relay
   * unreachable"), a warning's ("Erasure to finish").
   */
  title?: string | null;
  caption: string | null;
  /** `card`: the phone waits for the card held to it (the hand); `running`: it works. */
  state: CardStepState;
  /** Under a failed step's caption: what fixes it ("Open settings"). */
  fix?: CardStepsAction | null;
};

export function CardStepsView({
  stage,
  title,
  subtitle,
  steps,
  stepsLabel,
  stateWords,
  notice = null,
  primary,
  secondary = null,
  cancel,
  centered = false
}: {
  stage: Parameters<typeof HoldStage>[0];
  title: string;
  /** Under the title; none when empty. */
  subtitle: string;
  steps: readonly CardStep[];
  /** The list's name for screen readers ("Steps of the relay change"). */
  stepsLabel: string;
  /** How each state is said after a step's title, to screen readers (": done"). */
  stateWords: Record<CardStepState, string>;
  /** Under the steps: what the operation's outcome leaves to know (a channel not ready yet). */
  notice?: ReactNode;
  /** "Done" once done, "Try again" after a failure. */
  primary: CardStepsAction | null;
  /** Another way while the card is awaited ("I don't have the card"). */
  secondary?: CardStepsAction | null;
  /** "Cancel", while the card may still leave the phone. */
  cancel: CardStepsAction | null;
  /** The stage at its full size, above the title ("Card migration"). */
  centered?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} testID="card-steps">
        <View style={centered ? styles.headCentered : styles.head}>
          {centered ? <HoldStage {...stage} /> : <ScaledStage {...stage} />}
          <View style={centered ? styles.titlesCentered : styles.titles}>
            <Text
              accessibilityRole="header"
              aria-live="polite"
              style={[styles.title, centered && styles.titleCentered]}
              testID="card-steps-title"
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.subtitle, centered && styles.subtitleCentered]}
                testID="card-steps-subtitle"
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {steps.length > 0 ? (
          <View accessibilityRole="list" accessibilityLabel={stepsLabel} style={styles.steps}>
            {steps.map((step, index) => (
              <StepRow
                key={step.key}
                step={step}
                separated={index < steps.length - 1}
                stateWord={stateWords[step.state]}
              />
            ))}
          </View>
        ) : null}
        {notice}
      </ScrollView>
      {primary || secondary || cancel ? (
        <View style={styles.actions}>
          {primary ? (
            <Button
              icon={primary.icon}
              loading={primary.loading}
              disabled={primary.disabled}
              onPress={primary.onPress}
              testID={primary.testID ?? "card-steps-primary"}
            >
              {primary.label}
            </Button>
          ) : null}
          {secondary ? (
            <Button
              variant="secondary"
              size="md"
              icon={secondary.icon}
              onPress={secondary.onPress}
              testID="card-steps-secondary"
            >
              {secondary.label}
            </Button>
          ) : null}
          {cancel ? (
            <Button
              variant="text"
              loading={cancel.loading}
              disabled={cancel.disabled}
              onPress={cancel.onPress}
              testID="card-steps-cancel"
            >
              {cancel.label}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The stage at 112 px (196 scaled by 0.5714), beside the screen's title. */
function ScaledStage(props: Parameters<typeof HoldStage>[0]) {
  const styles = useStyles();
  return (
    <View style={styles.stageBox}>
      <View style={styles.stageScale}>
        <HoldStage {...props} />
      </View>
    </View>
  );
}

function StepRow({
  step,
  separated,
  stateWord
}: {
  step: CardStep;
  separated: boolean;
  stateWord: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const failed = step.state === "failed";
  const todo = step.state === "todo";
  const title = step.title ?? stepTitle(step.titles, step.state);
  return (
    <View style={[styles.step, separated && styles.separated]} testID={`card-step-${step.key}`}>
      {/* A new mark for each state, never the former one updated: see StepMark. */}
      <StepMark key={step.state} state={step.state} />
      <View style={styles.texts}>
        {/* Read as one: its title, its state, what it says. */}
        <View
          accessible
          accessibilityLabel={[`${title}${stateWord}`, step.caption].filter(Boolean).join(", ")}
          style={styles.words}
        >
          <Text
            style={[
              styles.stepTitle,
              {
                color: failed
                  ? colors.danger.fg
                  : todo
                    ? colors.text.secondary
                    : colors.text.primary
              }
            ]}
          >
            {title}
          </Text>
          {step.caption ? (
            <Text
              style={[styles.caption, { color: failed ? colors.danger.fg : colors.text.secondary }]}
            >
              {step.caption}
            </Text>
          ) : null}
        </View>
        {step.fix ? (
          <View style={styles.fix}>
            <Button
              variant="secondary"
              size="sm"
              icon={step.fix.icon}
              fullWidth={false}
              onPress={step.fix.onPress}
              testID={`card-step-${step.key}-fix`}
            >
              {step.fix.label}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A step's mark: a tick, a cross, the hand, the turning arc, or an empty ring. Made again for each
 * state (its `key`) and never flattened (`collapsable={false}`), so that Android creates its view
 * with all its props. Fabric on Android (React Native 0.86, FabricMountingManager.cpp) creates a
 * view with the raw props of its node's last change only (Props.cpp, while the feature flag
 * `enableAccumulatedUpdatesInRawPropsAndroid` is off, its default): a mark updated in place from
 * "in progress" (neither background nor border, so flattened) got a native view at its tick holding
 * the colour without the radius, and showed square (the ticks of the steps that had run square, the
 * others round).
 */
function StepMark({ state }: { state: CardStepState }): ReactNode {
  const { colors } = useTheme();
  const styles = useStyles();
  switch (state) {
    case "running":
      return (
        <View collapsable={false} style={styles.mark}>
          <Spinner size={28} />
        </View>
      );
    case "todo":
      return <View collapsable={false} style={[styles.mark, styles.ring]} />;
    case "warning":
      return (
        <View collapsable={false} style={[styles.mark, { backgroundColor: colors.warning.solid }]}>
          <Text style={styles.bang}>!</Text>
        </View>
      );
    default: {
      const look = marks(colors)[state];
      return (
        <View collapsable={false} style={[styles.mark, { backgroundColor: look.bg }]}>
          <Icon name={look.icon} size={12} color={palette.white} />
        </View>
      );
    }
  }
}

function marks(colors: ThemeColors) {
  return {
    done: { icon: "check", bg: colors.success.solid },
    failed: { icon: "xmark", bg: colors.danger.solid },
    card: { icon: "hand", bg: palette.orange }
  } as const satisfies Record<string, { icon: IconName; bg: string }>;
}

/** Under the actions, above the frame's bottom safe area. */
export const ACTIONS_BOTTOM = space[5];

/** The stage of 196 px drawn at 112. */
const STAGE_SIZE = 112;
const STAGE_SCALE = STAGE_SIZE / 196;

const useStyles = makeStyles(({ colors, shadow }) => ({
  screen: { flex: 1 },
  body: { paddingHorizontal: gutter, paddingTop: 10, paddingBottom: space[7], gap: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: space[6] },
  // "Card migration": the stage, then its title and what it says, centred.
  headCentered: { alignItems: "center", gap: space[6] },
  stageBox: { width: STAGE_SIZE, height: STAGE_SIZE },
  // Scaled about its centre (a transform's origin), then moved back to the box's corner.
  stageScale: {
    position: "absolute",
    left: (STAGE_SIZE - 196) / 2,
    top: (STAGE_SIZE - 196) / 2,
    transform: [{ scale: STAGE_SCALE }]
  },
  titles: { flex: 1, minWidth: 0, gap: 4 },
  titlesCentered: { alignItems: "center", gap: 8, maxWidth: 330 },
  title: {
    ...sans(700),
    fontSize: 20,
    letterSpacing: tracking(TITLE_EM, 20),
    lineHeight: 26,
    color: colors.text.primary
  },
  titleCentered: {
    fontSize: 22,
    letterSpacing: tracking(TITLE_EM, 22),
    lineHeight: 29,
    textAlign: "center"
  },
  subtitle: { ...sans(500), fontSize: 13.5, lineHeight: 20, color: colors.text.secondary },
  subtitleCentered: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  steps: {
    paddingVertical: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16
  },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  mark: {
    width: 28,
    height: 28,
    marginTop: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  ring: { borderWidth: 2, borderColor: colors.border.subtle },
  bang: { ...sans(700), fontSize: 14, lineHeight: 17, color: palette.white },
  texts: { flex: 1, minWidth: 0 },
  words: { gap: 2 },
  stepTitle: { ...sans(600), fontSize: 15 },
  caption: { ...sans(500), fontSize: 12.5, lineHeight: 18 },
  fix: { marginTop: 8 },
  // The bottom safe area is the frame's (PosFrame, or the sign-up's card step): the actions keep
  // only their margin above it, as a sheet does (Sheet.tsx). A bottom margin of 34 for an iPhone's
  // home indicator, which the frame already leaves, would set the button that much too high.
  actions: { paddingHorizontal: gutter, paddingBottom: ACTIONS_BOTTOM, gap: 6 }
}));
