import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Icon } from "@/components/ui/Icon";
import { useImageUri } from "@/features/media/images";
import type { CardState } from "@/lib/card/card-record";
import {
  lightShadow,
  makeStyles,
  palette,
  radius,
  sans,
  useTheme,
  type ThemeColors
} from "@/theme";

import {
  CARD_ASPECT,
  CARD_FACE,
  CARD_NAME_ZONE,
  CARD_PAUSE,
  cardFace,
  issuerInk,
  pauseStripesPath,
  type CardFace
} from "./card-look";
import type { VisualPreview } from "./issuer-visual";

/** A card's width in "Cards". */
export const CARD_WIDTH = CARD_FACE.width;
/** Its height: the shape of a bank card (CARD_ASPECT). */
export const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT);

/** A v2 card's visual not kept yet ("Swiss Bitcoin Pay card detected", migration.ts). */
export type LegacyFace = {
  /** The number printed on the card. */
  number: string;
  /** A light card: its name written in the app's ink over its image, else in white. */
  white: boolean;
  /** Its image downloaded, being downloaded, or none: the card's colour (issuer-visual.ts). */
  image: VisualPreview;
};

/**
 * The face of a card: its colour of the palette, an image its holder imported, or a v2 card's
 * visual; its label (`label`: its name, or "Card 9D81") written on it, in the ink its face takes
 * (card-look.ts). Over a v2 card's visual, only a name its holder gave it (`card.name`), never
 * "Card 9D81": the visual is the card the holder has in hand; its name, once given, is what tells
 * it apart. A v2 card's printed number is never written on its visual: CardUnderFace puts it under
 * the face. An image not read yet (from the relays, images.ts) shows the sand of the app meanwhile,
 * the label over it in ink. `width` scales it all ("Customize": 240); `placeholder`, the label is
 * what shows without a name, faded. `legacy`: a v2 card's visual not kept yet, drawn as its
 * issuer's visual once kept (cardFace); its number over the card's colour when its image could not
 * be downloaded. `paused`: the card in a pause, its face crossed with stripes (PausedMarks),
 * wherever "Cards" shows it: the phone's carousel, the desktop's row of cards and the face beside
 * its balance. A pause badge over its lower right corner too, but for `pauseBadge` false: a desktop
 * says the pause beside the face instead, after the card's name in the row and in the "Paused" pill
 * beside the balance.
 */
export function CardFaceView({
  card,
  label,
  width = CARD_WIDTH,
  placeholder = false,
  legacy = null,
  bare = false,
  mark = null,
  paused = false,
  pauseBadge = true,
  testID
}: {
  /** Its `name`, empty without one: over a v2 card's visual, only a name is written. */
  card: Pick<CardState, "cardId" | "look" | "issuer" | "name">;
  label: string;
  width?: number;
  placeholder?: boolean;
  legacy?: LegacyFace | null;
  /**
   * A v2 card's visual drawn alone, its label not written over it once it shows, even a name its
   * holder gave it (the stage where the card is held, HoldStage; "Swiss Bitcoin Pay card detected",
   * LegacyCardFound). Any other face keeps its label.
   */
  bare?: boolean;
  /**
   * What the stage draws over the face (HoldStage: the waves while the phone waits for the card),
   * under the same rule as its label: never over a v2 card's visual once it shows, so that a visual
   * not read (offline, a relay down) keeps them.
   */
  mark?: ReactNode;
  paused?: boolean;
  pauseBadge?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const face = cardFace(card);
  const kept = useImageUri(face.kind === "color" ? null : face.image);
  const { uri, fill, ink } = drawing(face, kept, legacy, colors);
  // A v2 card's visual showing: its holder's name only over it, and nothing with `bare`. While
  // it is read (or could not be), its face is the sand or its colour: its label says the card.
  const visual = uri !== null && (face.kind === "issuer" || legacy?.image.status === "shown");
  const written = !(visual && (bare || card.name === ""));
  // Never over a visual: only over the card's colour, its image not downloaded.
  const number = legacy?.image.status === "none" ? legacy.number : null;
  const scale = width / CARD_FACE.width;
  const nameSize = CARD_FACE.nameSize * scale;
  const height = Math.round(width / CARD_ASPECT);
  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: CARD_FACE.radius * scale,
          paddingTop: CARD_FACE.paddingTop * scale,
          paddingHorizontal: CARD_FACE.paddingSide * scale,
          backgroundColor: fill
        }
      ]}
      testID={testID}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
          testID={testID && `${testID}-image`}
        />
      ) : null}
      {/* Under its name and number, over its image: they stay written over the stripes. */}
      {paused ? (
        <PausedMarks width={width} height={height} scale={scale} ink={ink} badge={pauseBadge} />
      ) : null}
      {written ? (
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            {
              fontSize: nameSize,
              color: ink,
              opacity: placeholder ? 0.6 : 1
            }
          ]}
          testID={testID && `${testID}-label`}
        >
          {label}
        </Text>
      ) : null}
      {written ? mark : null}
      {number ? (
        <Text
          style={[
            styles.number,
            { fontSize: CARD_FACE.numberSize * scale, letterSpacing: 0.6 * scale, color: ink }
          ]}
        >
          {number}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The marks of a card in a pause: stripes in the ink of its name, then, with `badge`, the badge in
 * its lower right corner. Drawn only, in a View of its own that takes no touch: what holds the face
 * says the pause (its accessible name, the "Paused" pill).
 */
function PausedMarks({
  width,
  height,
  scale,
  ink,
  badge
}: {
  width: number;
  height: number;
  scale: number;
  ink: string;
  badge: boolean;
}) {
  const styles = useStyles();
  const size = CARD_PAUSE.badge * scale;
  const inset = CARD_PAUSE.badgeInset * scale;
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.paused}
      testID="card-face-paused"
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={pauseStripesPath(width, height, scale)} fill={ink} opacity={CARD_PAUSE.opacity} />
      </Svg>
      {badge ? (
        <View
          style={[styles.pauseBadge, { width: size, height: size, right: inset, bottom: inset }]}
          testID="card-face-pause-badge"
        >
          <Icon name="pause" size={CARD_PAUSE.icon * scale} color={palette.ink} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A v2 card's printed number (`number`), small, under the left of its face (very discreet, nothing
 * moved for it), and what keeps the card from paying (`status`, "Paused"), small too, under its
 * right (a pill under the carousel would move what follows it). Out of the layout, in the space
 * under the face,
 * between where the name starts on the face and as far from its right edge. Its parent is as wide
 * and high as the face (`width`); nothing without either. Out of the layout, it has only the space
 * its parents keep under the face (14 px): its text does not grow with the system's font size,
 * which would clip it or lay it over what follows (both are also said with the card,
 * CardCarousel.tsx). The number is never cut; a status too long for what is left is.
 */
export function CardUnderFace({
  number,
  status = null,
  width = CARD_WIDTH
}: {
  number: string | null;
  status?: string | null;
  width?: number;
}) {
  const styles = useStyles();
  if (!number && !status) return null;
  const side = CARD_NAME_ZONE.left * width;
  return (
    <View style={[styles.under, { left: side, right: side }]} testID="card-under-face">
      {number ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={styles.printed}
          testID="card-printed-number"
        >
          {number}
        </Text>
      ) : null}
      {status ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={styles.status}
          testID="card-face-status"
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What a face draws: its image (`uri`, null without one or while it is read), the fill under it,
 * and the ink of what is written on it. An image being read shows the app's sand, written in its
 * ink (the theme's `colors`).
 */
function drawing(
  face: CardFace,
  kept: string | null,
  legacy: LegacyFace | null,
  colors: ThemeColors
): { uri: string | null; fill: string; ink: string } {
  // A v2 card's visual not kept yet, written as cardFace writes on an issuer's visual. Without an
  // image to show, the card's own face.
  if (legacy && legacy.image.status !== "none") {
    if (legacy.image.status === "loading") {
      return { uri: null, fill: colors.background.subtle, ink: colors.text.primary };
    }
    return { uri: legacy.image.uri, fill: colors.background.subtle, ink: issuerInk(legacy.white) };
  }
  if (face.kind === "color") return { uri: null, fill: face.fill, ink: face.ink };
  return { uri: kept, fill: colors.background.subtle, ink: kept ? face.ink : colors.text.primary };
}

/**
 * A card in miniature, its face without its name ("Confirm the top-up": before the card's name in a
 * row). Drawn only: its name says the card.
 */
export function CardMini({ card }: { card: Pick<CardState, "cardId" | "look" | "issuer"> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const face = cardFace(card);
  const uri = useImageUri(face.kind === "color" ? null : face.image);
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mini,
        { backgroundColor: face.kind === "color" ? face.fill : colors.background.subtle }
      ]}
      testID="card-mini"
    >
      {face.kind !== "color" && uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  mini: {
    width: 30,
    height: 19,
    borderRadius: 4,
    overflow: "hidden",
    boxShadow: `inset 0 0 0 1px ${colors.border.faint}`
  },
  card: {
    overflow: "hidden",
    gap: 2,
    // A hairline ring: a pale face (an image, the sand) keeps its edges on the background.
    boxShadow: `inset 0 0 0 1px ${colors.border.faint}, ${shadow.card}`
  },
  paused: { ...StyleSheet.absoluteFill, pointerEvents: "none" },
  pauseBadge: {
    position: "absolute",
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    // Its ring keeps it apart from a light image.
    boxShadow: `inset 0 0 0 1px ${palette.ink10}, ${lightShadow.raised}`,
    alignItems: "center",
    justifyContent: "center"
  },
  name: { ...sans(600) },
  // Within the 14 px under the carousel's face (CardCarousel.tsx), above its dots.
  under: {
    position: "absolute",
    top: "100%",
    marginTop: 2,
    flexDirection: "row",
    gap: 8
  },
  printed: {
    flexShrink: 0,
    ...sans(500),
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  // At the right, as its pill said it (StatusChip, CardsScreen.tsx); alone, at the right too.
  status: {
    flexShrink: 1,
    marginLeft: "auto",
    ...sans(600),
    fontSize: 10,
    lineHeight: 12,
    color: colors.warning.fg
  },
  number: { ...sans(500), fontVariant: ["tabular-nums"] }
}));
