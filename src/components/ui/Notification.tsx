import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
  makeStyles,
  mono,
  radius,
  sans,
  space,
  type ThemeColors,
  tracked,
  type,
  useTheme
} from "@/theme";

import { Icon, type IconName } from "./Icon";
import { useHover } from "./useHover";

/**
 * The three tones of the design system's state colours (settled, underpaid, canceled),
 * and `warning` (the auto-lock's): the design system's warning colours, the
 * underpaid ochre as `info`, told apart by its icon.
 */
export type NotificationTone = "success" | "info" | "warning" | "error";

/** The optional action on the right: its label, then a glyph saying where it leads. */
export type NotificationAction = {
  label: string;
  /** "View →" leads somewhere, "Try again ↻" starts again. */
  icon: "arrow-right" | "arrow-rotate-right";
  onPress: () => void;
};

function tones(
  colors: ThemeColors
): Record<NotificationTone, { fg: string; bg: string; icon: IconName }> {
  return {
    success: { ...colors.success, icon: "circle-check" },
    info: { ...colors.warning, icon: "circle-info" },
    warning: { ...colors.warning, icon: "triangle-exclamation" },
    error: { ...colors.danger, icon: "circle-exclamation" }
  };
}

type NotificationProps = {
  tone: NotificationTone;
  title: ReactNode;
  body?: ReactNode;
  action?: NotificationAction;
};

/**
 * A notification's text without its final period (no notification ends with one). Only the
 * last one: the sentences before it keep theirs, and an ellipsis ("…", or
 * three dots) stays. Applied where it is shown, not in the translations: some of them are also
 * messages on screen (`team.errors.*`, `settings.errors.*`), which keep their period.
 */
export function withoutFinalPeriod(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(".") && !trimmed.endsWith("..") ? trimmed.slice(0, -1) : text;
}

/** Plain text without its final period; a component as it is. */
const shown = (content: ReactNode): ReactNode =>
  typeof content === "string" ? withoutFinalPeriod(content) : content;

/**
 * A notification: the state's tint carries the
 * whole message (title and body in its dark tone), a 28 pt circled icon without a disc, and an
 * optional action on the right, its label and a glyph, without a container.
 */
export function Notification({ tone, title, body, action }: NotificationProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { fg, bg, icon } = tones(colors)[tone];
  const { hovered, hoverProps } = useHover();
  return (
    <View style={[styles.card, { backgroundColor: bg }, action ? styles.withAction : null]}>
      <Icon name={icon} size={28} color={fg} style={styles.icon} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: fg }]}>{shown(title)}</Text>
        {body !== undefined ? (
          <Text style={[styles.body, { color: fg }]}>{shown(body)}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          {...hoverProps}
          style={({ pressed }) => [styles.action, pressed || hovered ? styles.actionActive : null]}
        >
          <Text style={[styles.actionLabel, { color: fg }]}>{action.label}</Text>
          <Icon name={action.icon} size={13} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** An amount inside a notification's body: mono, as everything counted ("24.50 CHF"). */
export function NotificationAmount({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.amount}>{children}</Text>;
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    paddingVertical: space[5],
    paddingLeft: space[5],
    paddingRight: 18,
    borderRadius: radius.lg,
    boxShadow: shadow.card
  },
  // The action's own padding takes the card's right edge.
  withAction: { paddingRight: space[3] },
  icon: { width: 40 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...sans(700), fontSize: 15, lineHeight: 21 },
  // The label role, tightened as the design system's (as Callout's and ErrorMessage's same size).
  body: { ...sans(500), fontSize: type.label, letterSpacing: tracked.label, lineHeight: 19.5 },
  // An amount in the body keeps mono's own spacing, not the body's.
  amount: { ...mono(600), letterSpacing: 0 },
  action: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: space[5],
    borderRadius: radius.pill
  },
  actionActive: { backgroundColor: colors.hoverOverlay },
  actionLabel: { ...sans(700), fontSize: 14.5 }
}));
