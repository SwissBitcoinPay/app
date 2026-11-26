import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import {
  makeStyles,
  palette,
  proseLineHeight,
  sans,
  type ThemeColors,
  tracked,
  type,
  useTheme
} from "@/theme";

/*
 * The steps of the migration's end, one under the other ("Your account is up to date"): each a
 * disc, its title and a sentence, the discs joined by a line, green once the step above is done.
 * Not in the design system: composed of its tokens (the success, warning and danger tones, Spinner,
 * Icon).
 */

export type TimelineState = "done" | "running" | "pending" | "warning" | "error";

export type TimelineStep = {
  key: string;
  state: TimelineState;
  title: string;
  caption?: string;
  /** How far a running step is, when it is counted: a bar, told to screen readers too. */
  progress?: { now: number; max: number };
  /** What its owner may do about it ("Try again", "Type my 12 words"). */
  actions?: ReactNode;
  testID?: string;
};

const DISC = 30;

/** The disc's fill and its glyph, by state (a running step's is the Spinner). */
function discs(
  colors: ThemeColors
): Record<Exclude<TimelineState, "running">, { bg: string; fg: string; icon?: IconName }> {
  return {
    // White on the success green: 3.4:1, over the 3:1 a glyph needs.
    done: { bg: colors.success.solid, fg: palette.white, icon: "check" },
    pending: { bg: colors.background.subtle, fg: colors.text.secondary },
    warning: { bg: colors.warning.bg, fg: colors.warning.fg, icon: "exclamation" },
    error: { bg: colors.danger.bg, fg: colors.danger.fg, icon: "xmark" }
  };
}

export function MigrationTimeline({
  steps,
  testID
}: {
  steps: readonly TimelineStep[];
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View accessibilityRole="list" style={styles.list} testID={testID}>
      {steps.map((step, at) => {
        const last = at === steps.length - 1;
        return (
          <View key={step.key} style={styles.row} testID={step.testID}>
            <View style={styles.rail}>
              <Disc state={step.state} number={at + 1} />
              {last ? null : (
                <View
                  style={[
                    styles.line,
                    step.state === "done" ? styles.lineDone : styles.lineWaiting
                  ]}
                />
              )}
            </View>
            <View style={[styles.body, last ? null : styles.bodySpaced]}>
              <View
                accessible
                accessibilityRole={step.progress ? "progressbar" : "text"}
                accessibilityLabel={step.caption ? `${step.title}. ${step.caption}` : step.title}
                accessibilityValue={
                  step.progress
                    ? { min: 0, max: step.progress.max, now: step.progress.now }
                    : undefined
                }
                style={styles.words}
              >
                <Text style={styles.title}>{step.title}</Text>
                {step.progress ? <Bar {...step.progress} /> : null}
                {step.caption ? <Text style={styles.caption}>{step.caption}</Text> : null}
              </View>
              {step.actions ? <View style={styles.actions}>{step.actions}</View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Disc({ state, number }: { state: TimelineState; number: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (state === "running") {
    return (
      <View style={styles.disc}>
        <Spinner size={DISC} />
      </View>
    );
  }
  const { bg, fg, icon } = discs(colors)[state];
  return (
    <View style={[styles.disc, { backgroundColor: bg }]}>
      {icon ? (
        <Icon name={icon} size={14} color={fg} />
      ) : (
        <Text style={[styles.number, { color: fg }]}>{number}</Text>
      )}
    </View>
  );
}

/** A counted wait: its share of `max` in orange on sand (never past the end). */
function Bar({ now, max }: { now: number; max: number }) {
  const styles = useStyles();
  const share = max > 0 ? Math.min(1, Math.max(0, now / max)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${share * 100}%` }]} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { gap: 0 },
  row: { flexDirection: "row", gap: 14 },
  rail: { width: DISC, alignItems: "center" },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  number: { ...sans(700), fontSize: type.label, letterSpacing: tracked.label },
  line: { width: 2, flexGrow: 1, minHeight: 16, marginVertical: 4, borderRadius: 1 },
  lineDone: { backgroundColor: colors.success.solid },
  lineWaiting: { backgroundColor: colors.border.subtle },
  body: { flex: 1, gap: 10, paddingTop: (DISC - 22) / 2 },
  bodySpaced: { paddingBottom: 22 },
  words: { gap: 6 },
  title: {
    ...sans(700),
    fontSize: type.action,
    letterSpacing: tracked.action,
    lineHeight: 22,
    color: colors.text.primary
  },
  caption: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  actions: { gap: 10, alignItems: "flex-start" },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.background.accent }
}));
