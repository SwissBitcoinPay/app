import { useState, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import {
  cardInset,
  makeStyles,
  palette,
  proseLineHeight,
  radius,
  sans,
  space,
  tracked,
  type,
  useTheme
} from "@/theme";

import { Icon } from "./Icon";

/*
 * What a screen is for, while it has nothing to show yet: its steps, each a drawing numbered in an orange disc, its title and what
 * it says. On a phone, one card of steps one under the other, their drawings joined by a dotted
 * line; on a desktop, the steps side by side once they fit, each in its own card, a chevron between
 * two. `bare`: in a card already (the wallet's table), the steps without cards of their own. The
 * drawings are decoration (src/components/illustrations/): a screen reader reads each step as one
 * item, its number, its title and what it says.
 */

export type GuideStep = {
  key: string;
  title: string;
  caption: string;
  /** Its drawing, `size` px square. */
  Art: ComponentType<{ size: number }>;
};

/** Where steps side by side need room, each its smallest width and the space between two. */
const SIDE_BY_SIDE = {
  framed: { min: 220, gap: 32 },
  bare: { min: 250, gap: 24 }
} as const;

export function StepGuide({
  title,
  lead,
  steps,
  label,
  wide = false,
  bare = false,
  compact = false,
  testID
}: {
  /** Its heading; none where the screen's own title says it (the wallet's "Transactions"). */
  title?: string;
  lead?: string;
  steps: readonly GuideStep[];
  /** The list's name for screen readers: `title` by default. */
  label?: string;
  /** A desktop's page: the steps side by side once they fit. */
  wide?: boolean;
  bare?: boolean;
  /** Smaller drawings, under a screen's other content (the wallet's balance). */
  compact?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // Side by side until measured (a desktop's page is wide), then only where they fit.
  const [width, setWidth] = useState(0);
  const room = SIDE_BY_SIDE[bare ? "bare" : "framed"];
  const needed = steps.length * room.min + (steps.length - 1) * room.gap;
  const side = wide && (width === 0 || width >= needed);
  const name = label ?? title;

  let list;
  if (side) {
    list = (
      <View
        accessibilityRole="list"
        accessibilityLabel={name}
        style={[styles.row, { gap: room.gap }]}
        testID={testID ? `${testID}-steps` : undefined}
      >
        {steps.map((step, index) =>
          bare ? (
            <View key={step.key} style={styles.column}>
              <StepRow
                step={step}
                number={index + 1}
                artSize={96}
                badge={26}
                below={0}
                testID={testID}
              />
            </View>
          ) : (
            <View key={step.key} style={styles.tile}>
              <StepTile step={step} number={index + 1} testID={testID} />
              {index < steps.length - 1 ? (
                <View style={styles.chevron} testID={testID ? `${testID}-next` : undefined}>
                  <Icon name="chevron-right" size={14} color={colors.text.secondary} />
                </View>
              ) : null}
            </View>
          )
        )}
      </View>
    );
  } else {
    const artSize = compact ? 72 : 88;
    list = (
      <View
        accessibilityRole="list"
        accessibilityLabel={name}
        style={bare ? null : styles.card}
        testID={testID ? `${testID}-steps` : undefined}
      >
        {steps.map((step, index) => (
          <StepRow
            key={step.key}
            step={step}
            number={index + 1}
            artSize={artSize}
            badge={compact ? 24 : 26}
            joined={index < steps.length - 1}
            below={ROW_PADDING}
            testID={testID}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      style={styles.guide}
      onLayout={wide ? (event) => setWidth(event.nativeEvent.layout.width) : undefined}
      testID={testID}
    >
      {title || lead ? (
        <View style={styles.head}>
          {title ? (
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {lead ? <Text style={styles.lead}>{lead}</Text> : null}
        </View>
      ) : null}
      {list}
    </View>
  );
}

/**
 * The drawing on the left, its texts centred beside it, `below` under both; `joined`: the space
 * between it and the next row (twice `below`) carries the dotted line from its drawing to the
 * next one's.
 */
function StepRow({
  step,
  number,
  artSize,
  badge,
  below,
  joined = false,
  testID
}: {
  step: GuideStep;
  number: number;
  artSize: number;
  badge: number;
  below: number;
  joined?: boolean;
  /** The guide's: its parts' are made from it. */
  testID?: string;
}) {
  const styles = useStyles();
  const after = joined ? below * 2 : below;
  return (
    <View
      accessible
      // An item of the list: on the web, a list without items is read as empty.
      role="listitem"
      accessibilityLabel={`${number}. ${step.title}, ${step.caption}`}
      style={styles.step}
    >
      <View style={{ width: artSize, paddingBottom: joined ? 0 : after }}>
        <StepArt step={step} number={number} size={artSize} badge={badge} testID={testID} />
        {joined ? <Joint minHeight={after} testID={testID && `${testID}-joint`} /> : null}
      </View>
      <View style={[styles.textsColumn, { paddingBottom: after }]}>
        <View style={[styles.texts, { minHeight: artSize }]}>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.caption}>{step.caption}</Text>
        </View>
      </View>
    </View>
  );
}

/** Side by side, in a card: the drawing above its title. */
function StepTile({ step, number, testID }: { step: GuideStep; number: number; testID?: string }) {
  const styles = useStyles();
  return (
    <View
      accessible
      role="listitem"
      accessibilityLabel={`${number}. ${step.title}, ${step.caption}`}
      style={styles.tileContent}
    >
      <StepArt step={step} number={number} size={120} badge={30} testID={testID} />
      <View style={styles.tileTexts}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.caption}>{step.caption}</Text>
      </View>
    </View>
  );
}

/** The drawing, its number in an orange disc over its top left (ink on orange: 7:1). */
function StepArt({
  step: { Art },
  number,
  size,
  badge,
  testID
}: {
  step: GuideStep;
  number: number;
  size: number;
  badge: number;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={{ width: size, height: size }}>
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID && `${testID}-art`}
      >
        <Art size={size} />
      </View>
      <View
        style={[
          styles.badge,
          { width: badge, height: badge, borderRadius: badge / 2 },
          badge > 26 && styles.badgeLarge
        ]}
      >
        {/* In its disc at any text size: the step's label says it too. */}
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.badgeText, badge > 26 && styles.badgeTextLarge]}
        >
          {number}
        </Text>
      </View>
    </View>
  );
}

/** Above and below each row of steps one under the other. */
const ROW_PADDING = space[5];

/**
 * The dotted line from a drawing to the next one's, as tall as what is left of its row: the drawing
 * spans the view, whatever its height (on Android and iOS, a drawing's backing bitmap is as large as
 * the drawing itself: never longer than what shows).
 */
function Joint({ minHeight, testID }: { minHeight: number; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.joint, { minHeight }]} testID={testID}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Line
          x1="50%"
          y1={0}
          x2="50%"
          y2="100%"
          stroke={colors.border.strong}
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeDasharray="3 4"
        />
      </Svg>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  guide: { gap: 18 },
  head: { gap: space[3] },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    lineHeight: type.title * 1.3,
    color: colors.text.primary
  },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    maxWidth: 560
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingHorizontal: cardInset,
    paddingTop: space[3] + ROW_PADDING,
    paddingBottom: space[3]
  },
  step: { flexDirection: "row", gap: cardInset },
  textsColumn: { flex: 1, minWidth: 0 },
  texts: { justifyContent: "center", gap: space[1] },
  stepTitle: {
    ...sans(700),
    fontSize: type.body,
    lineHeight: type.body * 1.35,
    color: colors.text.primary
  },
  caption: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.45,
    color: colors.text.secondary
  },
  joint: { flex: 1 },
  badge: {
    position: "absolute",
    left: -3,
    top: -3,
    backgroundColor: palette.orange,
    boxShadow: `0px 0px 0px 2.5px ${colors.background.surface}`,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeLarge: { left: -2, top: -2, boxShadow: `0px 0px 0px 3px ${colors.background.surface}` },
  badgeText: { ...sans(700), fontSize: 12.5, color: palette.ink },
  badgeTextLarge: { fontSize: 14 },
  row: { flexDirection: "row", alignItems: "stretch" },
  column: { flex: 1, minWidth: 0 },
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card
  },
  tileContent: { paddingTop: 24, paddingHorizontal: 22, paddingBottom: 26, gap: space[6] },
  tileTexts: { gap: space[2] },
  // In the space between two cards, at their middle's height.
  chevron: {
    position: "absolute",
    right: -28,
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  }
}));
