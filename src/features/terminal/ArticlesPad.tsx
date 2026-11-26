import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { useHover } from "@/components/ui/useHover";
import { ArticlePhoto } from "@/features/catalog/ArticlesScreen";
import type { Article } from "@/lib/catalog/article";
import { formatInteger } from "@/lib/locale/format";
import { formatFiat } from "@/lib/terminal/amount";
import { MAX_LINE_QUANTITY, quantityOf } from "@/lib/terminal/basket";
import {
  control,
  makeStyles,
  mono,
  proseLineHeight,
  radius,
  sans,
  space,
  tracked,
  type
} from "@/theme";

import { usePos } from "./pos";

/** Between the tiles, both ways. */
const GAP = space[4];
/** A tile's "−" (LessAndCount): its button (the touch floor), its disc, the pill around it. */
const CORNER = control.min;
const DISC = 24;
const PILL_PADDING = 2;
/** From the pill to the tile's right edge. */
const PILL_INSET = 5;

/** The price of one unit of an article as the point of sale shows it: "—" without a rate. */
export function usePriceText(): (minor: number | undefined) => string {
  const { digits, languageTag } = usePos();
  return (minor) => (minor === undefined ? "—" : formatFiat(minor, digits, languageTag));
}

/**
 * "Items" of the point of sale: the catalogue's articles as tiles, three a row on mobile, each its
 * photo (or
 * its initials), its name and its price in the point of sale's currency; a tap adds one to the
 * basket, whose count shows on the tile, a "−" beside it taking one off. On desktop, as many a
 * row as fit 120 px tiles; without articles (only on the owner's device), what stands: the
 * catalogue being read, unreadable, or read without articles, and where to add them. Never "no
 * article" before the catalogue was read.
 */
export function ArticlesPad({
  priceOf,
  columns
}: {
  priceOf: (article: Article) => number | undefined;
  columns: number;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { catalog, basket, changeBasket, views } = usePos();
  const priceText = usePriceText();
  const [width, setWidth] = useState<number | null>(null);
  const tile = width === null ? undefined : (width - GAP * (columns - 1)) / columns;
  if (catalog.articles.length === 0) {
    return (
      <View style={styles.empty} testID={`articles-empty-${catalog.state}`}>
        {catalog.state === "reading" ? (
          <>
            <Spinner size={22} />
            <Text style={styles.emptyBody} accessibilityLiveRegion="polite">
              {t("pos.articles.empty.reading")}
            </Text>
          </>
        ) : catalog.state === "unreadable" ? (
          <>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {t("pos.articles.empty.unreadableTitle")}
            </Text>
            <Text style={styles.emptyBody}>{t("pos.articles.empty.unreadableBody")}</Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {t("pos.articles.empty.noneTitle")}
            </Text>
            <Text style={styles.emptyBody}>
              {views.includes("scan")
                ? t("pos.articles.empty.noneBodyScan")
                : t("pos.articles.empty.noneBody")}
            </Text>
          </>
        )}
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      testID="articles-pad"
    >
      {catalog.articles.map((article) => (
        <ArticleTile
          key={article.id}
          article={article}
          width={tile}
          price={priceText(priceOf(article))}
          quantity={quantityOf(basket, article.id)}
          onPress={() => changeBasket(article.id, 1)}
          onLess={() => changeBasket(article.id, -1)}
        />
      ))}
    </ScrollView>
  );
}

function ArticleTile({
  article,
  width,
  price,
  quantity,
  onPress,
  onLess
}: {
  article: Article;
  width: number | undefined;
  price: string;
  quantity: number;
  onPress: () => void;
  onLess: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { hovered, hoverProps } = useHover();
  return (
    <View style={width === undefined ? styles.tileFallback : { width }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("pos.articles.tile", { name: article.name, price })}
        accessibilityHint={
          quantity > 0 ? t("pos.articles.inBasket", { count: quantity }) : t("pos.articles.add")
        }
        disabled={quantity >= MAX_LINE_QUANTITY}
        onPress={onPress}
        testID={`article-${article.id}`}
        {...hoverProps}
        style={styles.tile}
      >
        {({ pressed }) => (
          <>
            <ArticlePhoto article={article} style={styles.photo} initialsSize={16} />
            <Text numberOfLines={1} style={styles.name}>
              {article.name}
            </Text>
            <Text numberOfLines={1} style={styles.price}>
              {price}
            </Text>
            {hovered || pressed ? <View style={styles.tint} /> : null}
          </>
        )}
      </Pressable>
      {quantity > 0 ? (
        <LessAndCount
          name={article.name}
          count={formatInteger(quantity, languageTag)}
          onLess={onLess}
          testID={`article-${article.id}`}
        />
      ) : null}
    </View>
  );
}

/**
 * Over a tile's top right corner, the article being in the basket: a white pill holding a "−"
 * and the count, orange. The "−" is drawn 24 px wide, its button is
 * 44 px (the touch floor), reaching over the photo and under the count's first 8 px. Beside the
 * tile, not in it: a button holds no other button (the web). Taps anywhere else, the rest of the
 * count included, go through to the tile: one more.
 */
function LessAndCount({
  name,
  count,
  onLess,
  testID
}: {
  name: string;
  count: string;
  onLess: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.corner}>
      <View style={styles.pill} />
      <IconButton
        icon="minus"
        tone="filled"
        size={10}
        disc={DISC}
        label={t("pos.basket.less", { name })}
        onPress={onLess}
        testID={`${testID}-less`}
        style={styles.less}
      />
      {/* Not read: the tile's hint says the count already (it was inside the tile's button). */}
      <View
        style={styles.badge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`${testID}-quantity`}
      >
        <Text style={styles.badgeText}>{count}</Text>
      </View>
    </View>
  );
}

/** − n +: the quantity of one line of the basket (the scan's card, the basket's rows). */
export function QuantityStepper({
  name,
  quantity,
  onChange,
  testID
}: {
  /** The article's name, for the buttons' accessible names. */
  name: string;
  quantity: number;
  onChange: (delta: number) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  return (
    <View style={styles.stepper} testID={testID}>
      <IconButton
        icon="minus"
        tone="filled"
        size={14}
        label={t("pos.basket.less", { name })}
        disabled={quantity <= 0}
        onPress={() => onChange(-1)}
        testID={testID ? `${testID}-less` : undefined}
      />
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={t("pos.basket.quantity", { count: quantity })}
        style={styles.quantity}
        testID={testID ? `${testID}-count` : undefined}
      >
        {formatInteger(quantity, languageTag)}
      </Text>
      <IconButton
        icon="plus"
        tone="filled"
        size={14}
        label={t("pos.basket.more", { name })}
        disabled={quantity >= MAX_LINE_QUANTITY}
        onPress={() => onChange(1)}
        testID={testID ? `${testID}-more` : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1, minHeight: 0 },
  empty: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[6]
  },
  emptyTitle: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary,
    textAlign: "center"
  },
  emptyBody: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    textAlign: "center"
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingBottom: space[5] },
  tile: {
    height: 112,
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    overflow: "hidden"
  },
  // Until the grid is measured (and in Jest, which has no layout): about a third of the row.
  tileFallback: { flexBasis: "30%", flexGrow: 1 },
  photo: { height: 60 },
  name: {
    ...sans(600),
    fontSize: type.caption,
    color: colors.text.primary,
    paddingHorizontal: 10,
    paddingTop: 7
  },
  price: {
    ...mono(500),
    fontSize: type.meta,
    color: colors.text.secondary,
    paddingHorizontal: 10,
    paddingTop: 1
  },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: colors.hoverOverlay },
  // The "−" and the count: a row as tall as the "−"'s button, at the tile's top right corner.
  // Only the "−" takes taps (box-none, the count and the pill none): the rest is the tile's.
  corner: {
    position: "absolute",
    top: 0,
    right: 0,
    height: CORNER,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: PILL_INSET + PILL_PADDING,
    pointerEvents: "box-none"
  },
  // 2 px around the "−" and the count, 28 px high.
  pill: {
    position: "absolute",
    top: (CORNER - DISC) / 2 - PILL_PADDING,
    bottom: (CORNER - DISC) / 2 - PILL_PADDING,
    left: (CORNER - DISC) / 2 - PILL_PADDING,
    right: PILL_INSET,
    borderRadius: DISC / 2 + PILL_PADDING,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.raised,
    pointerEvents: "none"
  },
  // The 44 px button, its disc in the middle; its right part under the count, 2 px from the disc.
  less: { marginRight: PILL_PADDING - (CORNER - DISC) / 2 },
  // The count of the article in the basket: orange is a fill, its figure white.
  badge: {
    minWidth: DISC,
    height: DISC,
    paddingHorizontal: 6,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.accent,
    pointerEvents: "none"
  },
  badgeText: {
    ...sans(700),
    fontSize: 12,
    color: colors.text.onAccent,
    fontVariant: ["tabular-nums"]
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[2] },
  quantity: {
    ...sans(700),
    minWidth: 30,
    textAlign: "center",
    fontSize: type.action,
    letterSpacing: tracked.action,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  }
}));
