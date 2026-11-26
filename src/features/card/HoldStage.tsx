import { Platform, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon } from "@/components/ui/Icon";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, palette, useTheme } from "@/theme";

import { CardFaceView, type LegacyFace } from "./CardFaceView";
import { CARD_ASPECT } from "./card-look";

/*
 * Where the card is held to the phone, as the
 * phones read it: Android, against its back, the phone seen from behind (the card well in sight
 * over it); iPhone, at its top, the phone seen from the front. Phone and card are drawn at 82 %
 * about the disc's centre, the card never out of it, tilted the same on both; the waves on the card
 * while the phone waits for it, the badge inside the disc once it is done or failed. Drawn only:
 * the screen's title says where to hold the card. A v2 card's visual, once it shows, has nothing
 * drawn over it, the waves neither: it is the card the holder has
 * in hand. CardFaceView draws them, under the rule that leaves its label off that visual.
 */

/** The disc's side: 196 px. */
const SIDE = 196;

/** Where the card and the badge go on each phone. */
const PLACES = {
  ios: { card: { left: 77, top: 24 }, badge: { left: 136, top: 62 } },
  android: { card: { left: 77, top: 62 }, badge: { left: 136, top: 92 } }
} as const;

export function HoldStage({
  card,
  label,
  waves,
  badge,
  blank = false,
  legacy = null
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer" | "name">;
  /** The card's name, or "Card 9D81", written on its face (not over a v2 card's visual). */
  label: string;
  /** The phone waits for the card: its waves on it, but over a v2 card's visual. */
  waves: boolean;
  badge: "ok" | "fail" | null;
  /** The card blank again ("Delete the card"): a plain face, nothing written on it. */
  blank?: boolean;
  /** A v2 card's visual not kept yet (its migration, MigrationSteps.tsx), drawn over its face. */
  legacy?: LegacyFace | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ios = Platform.OS === "ios";
  const place = PLACES[ios ? "ios" : "android"];
  const wavesMark = waves ? (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke={palette.orange}
      strokeWidth={2.2}
      strokeLinecap="round"
      style={styles.waves}
      testID="hold-stage-waves"
    >
      <Path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <Path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <Path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
    </Svg>
  ) : null;
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.stage}
      testID="hold-stage"
    >
      <View style={styles.disc} />
      <View style={styles.scene}>
        {ios ? (
          <View style={styles.front}>
            <View style={styles.screen}>
              <View style={styles.island} />
            </View>
          </View>
        ) : (
          <View style={styles.back}>
            <View style={styles.module}>
              <View style={[styles.lens, styles.lensTop]} />
              <View style={[styles.lens, styles.lensBottom]} />
            </View>
          </View>
        )}
        <View style={[styles.card, place.card]}>
          {blank ? (
            <View style={styles.blank} testID="hold-stage-blank">
              {wavesMark}
            </View>
          ) : (
            <CardFaceView
              card={card}
              label={label}
              width={CARD_WIDTH}
              legacy={legacy}
              bare
              mark={wavesMark}
              testID="hold-stage-face"
            />
          )}
        </View>
      </View>
      {badge ? (
        <View
          style={[
            styles.badge,
            place.badge,
            { backgroundColor: badge === "ok" ? colors.success.solid : colors.danger.solid }
          ]}
          testID={`hold-stage-${badge}`}
        >
          <Icon name={badge === "ok" ? "check" : "xmark"} size={16} color={palette.white} />
        </View>
      ) : null}
    </View>
  );
}

/** The card's width on the stage: 104 px, its face scaled to it. */
const CARD_WIDTH = 104;

const useStyles = makeStyles(({ colors, shadow }) => ({
  stage: { width: SIDE, height: SIDE },
  disc: {
    ...StyleSheet.absoluteFill,
    borderRadius: SIDE / 2,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  // Phone and card at 82 %, about the disc's centre (a transform scales about the view's centre).
  scene: { ...StyleSheet.absoluteFill, transform: [{ scale: 0.82 }] },
  back: {
    position: "absolute",
    left: 56,
    top: 24,
    width: 84,
    height: 164,
    borderRadius: 20,
    backgroundColor: colors.illustration.phone,
    boxShadow: `inset 0 0 0 2px ${palette.ink}`
  },
  module: {
    position: "absolute",
    top: 9,
    left: 9,
    width: 30,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.illustration.module,
    boxShadow: `inset 0 0 0 1px ${colors.illustration.glint}`
  },
  lens: {
    position: "absolute",
    left: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.illustration.lens,
    boxShadow: `inset 0 0 0 1.5px ${colors.illustration.lensRing}`
  },
  lensTop: { top: 4 },
  lensBottom: { top: 18 },
  front: {
    position: "absolute",
    left: 56,
    top: 24,
    width: 84,
    height: 164,
    padding: 4,
    borderRadius: 20,
    backgroundColor: palette.ink
  },
  // A faint gradient of the screen (#3A332D to #2A2521), drawn flat: no gradient is drawn anywhere
  // else in the app.
  screen: { flex: 1, borderRadius: 16, backgroundColor: colors.illustration.phone },
  island: {
    position: "absolute",
    top: 6,
    left: "50%",
    width: 24,
    height: 7,
    marginLeft: -12,
    borderRadius: 4,
    backgroundColor: palette.ink
  },
  card: {
    position: "absolute",
    borderRadius: 8,
    boxShadow: shadow.held,
    transform: [{ rotate: "-10deg" }]
  },
  // #F7F4EE drawn as the brand's cream, its nearest colour: a blank card, light in both themes.
  blank: {
    width: CARD_WIDTH,
    height: Math.round(CARD_WIDTH / CARD_ASPECT),
    borderRadius: 8,
    backgroundColor: palette.cream,
    borderWidth: 1,
    borderColor: palette.ink14
  },
  waves: { position: "absolute", right: 6, top: 6 },
  badge: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 0 0 4px ${colors.background.surface}`
  }
}));
