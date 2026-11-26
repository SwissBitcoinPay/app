import { StyleSheet, Text, View } from "react-native";

import { palette, radius, sans, space, type ThemeColors, tracked, type, useTheme } from "@/theme";

import { Icon, type IconName } from "./Icon";

/**
 * The three tones of a callout, the design system's (as the notifications', Notification.tsx):
 * `success` the settled state's green, `warning` the underpaid ochre, `error` the canceled red.
 */
export type CalloutTone = "success" | "warning" | "error";

/** A step of a callout: what is done, and what is not yet ("Payment received", "Added to your balance"). */
export type CalloutStep = {
  label: string;
  /** On the right, short: "3 confirmations", "pending". */
  detail?: string;
  done: boolean;
};

type CalloutProps = {
  tone: CalloutTone;
  /** By default the tone's (tones); `clock-regular` for what only needs time. */
  icon?: IconName;
  title?: string;
  /** Each step on its line, done in green, the others in the tone's colours. */
  steps?: readonly CalloutStep[];
  /** The explanation, under the title, or under the steps. */
  children?: string;
  /**
   * A text alone (no title nor steps), smaller: a note inside a card (the split's fees, under
   * Mt Pelerin's), its text at the caption's size in a tighter box.
   */
  small?: boolean;
  testID?: string;
};

type ToneColors = { fg: string; bg: string; solid: string; icon: IconName };

function tones(colors: ThemeColors): Record<CalloutTone, ToneColors> {
  return {
    success: { ...colors.success, icon: "circle-check" },
    warning: { ...colors.warning, icon: "triangle-exclamation" },
    error: { ...colors.danger, icon: "circle-exclamation" }
  };
}

/**
 * An explanation in place, in a box tinted with its tone: its icon and title, or
 * its steps, then its text. Unlike a notification (useNotifications), it stays as long as what it
 * explains: nothing to dismiss, no action.
 */
export function Callout({ tone, icon, title, steps, children, small, testID }: CalloutProps) {
  const { colors } = useTheme();
  const look = tones(colors)[tone];
  const textColor = { color: look.fg };
  if (small && !title && !steps) {
    return (
      <View
        style={[styles.smallBox, styles.smallRow, { backgroundColor: look.bg }]}
        testID={testID}
      >
        <Glyph name={icon ?? look.icon} color={look.fg} line="small" />
        <Text style={[styles.smallBody, styles.texts, textColor]}>{children}</Text>
      </View>
    );
  }
  if (!steps) {
    return (
      <View style={[styles.box, styles.row, { backgroundColor: look.bg }]} testID={testID}>
        <Glyph name={icon ?? look.icon} color={look.fg} line={title ? "title" : "body"} />
        <View style={styles.texts}>
          {title ? <Text style={[styles.title, textColor]}>{title}</Text> : null}
          {children ? <Text style={[styles.body, textColor]}>{children}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.box, { backgroundColor: look.bg }]} testID={testID}>
      {title ? (
        <View style={styles.row}>
          <Glyph name={icon ?? look.icon} color={look.fg} line="title" />
          <Text style={[styles.title, styles.texts, textColor]}>{title}</Text>
        </View>
      ) : null}
      <View style={styles.steps}>
        {steps.map((step, index) => (
          <Step key={index} step={step} tone={look} testID={testID && `${testID}-step-${index}`} />
        ))}
      </View>
      {children ? (
        <View
          style={[styles.divided, { borderTopColor: look.fg + "33" }]}
          testID={testID && `${testID}-text`}
        >
          <Text style={[styles.body, textColor]}>{children}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The icon centred on the first line of the title, or of the text without a title (the glyph's
 * line is 1.15 times its size, see Icon). Decorative: the text says it.
 */
function Glyph({
  name,
  color,
  line
}: {
  name: IconName;
  color: string;
  line: "title" | "body" | "small";
}) {
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={
        line === "title"
          ? styles.glyphTitle
          : line === "small"
            ? styles.glyphSmall
            : styles.glyphBody
      }
    >
      <Icon name={name} size={line === "small" ? SMALL_GLYPH_SIZE : GLYPH_SIZE} color={color} />
    </View>
  );
}

/**
 * A step: a filled green disc with a check once done, else a dashed ring of the tone around a
 * clock. Read as one element: its label, then its detail.
 */
function Step({ step, tone, testID }: { step: CalloutStep; tone: ToneColors; testID?: string }) {
  const { colors } = useTheme();
  const color = { color: step.done ? colors.success.fg : tone.fg };
  return (
    <View
      style={styles.step}
      accessible
      accessibilityLabel={step.detail ? `${step.label}, ${step.detail}` : step.label}
      testID={testID}
    >
      {step.done ? (
        <View
          style={[styles.marker, { backgroundColor: colors.success.solid }]}
          testID={testID && `${testID}-marker`}
        >
          <Icon name="check" size={11} color={palette.white} />
        </View>
      ) : (
        <View
          style={[styles.marker, styles.pending, { borderColor: tone.solid }]}
          testID={testID && `${testID}-marker`}
        >
          <Icon name="clock-regular" size={11} color={tone.fg} />
        </View>
      )}
      <Text style={[styles.stepLabel, color]} numberOfLines={2}>
        {step.label}
      </Text>
      {step.detail ? (
        <Text style={[styles.stepDetail, color]} numberOfLines={1}>
          {step.detail}
        </Text>
      ) : null}
    </View>
  );
}

const GLYPH_SIZE = 16;
const TITLE_LINE = 20;
const BODY_LINE = type.label * 1.45;
const SMALL_GLYPH_SIZE = 13;
const SMALL_LINE = type.caption * 1.4;

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space[6], gap: space[5] },
  row: { flexDirection: "row", gap: space[5] },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  title: {
    ...sans(700),
    fontSize: type.sats,
    lineHeight: TITLE_LINE
  },
  glyphTitle: { marginTop: (TITLE_LINE - GLYPH_SIZE * 1.15) / 2 },
  glyphBody: { marginTop: (BODY_LINE - GLYPH_SIZE * 1.15) / 2 },
  smallBox: { borderRadius: radius.sm, paddingVertical: space[4], paddingHorizontal: space[5] },
  smallRow: { flexDirection: "row", gap: space[4] },
  glyphSmall: { marginTop: (SMALL_LINE - SMALL_GLYPH_SIZE * 1.15) / 2 },
  smallBody: { ...sans(500), fontSize: type.caption, lineHeight: SMALL_LINE },
  body: { ...sans(500), fontSize: type.label, letterSpacing: tracked.label, lineHeight: BODY_LINE },
  divided: { borderTopWidth: 1, paddingTop: space[5] },
  steps: { gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 10 },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  pending: { borderWidth: 2, borderStyle: "dashed" },
  stepLabel: { ...sans(700), flexShrink: 1, fontSize: type.sats },
  stepDetail: { ...sans(500), marginLeft: "auto", paddingLeft: space[4], fontSize: type.caption }
});
