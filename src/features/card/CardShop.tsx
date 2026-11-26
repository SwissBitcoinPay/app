import { useTranslation } from "react-i18next";
import { Image, Text, View, type ImageSourcePropType } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { openExternal } from "@/components/ui/external-link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CARD_SHOP_URL } from "@/config/card-shop";
import { makeStyles, radius, sans, space } from "@/theme";

/*
 * "Choose your card": the sattle.me shop (card-shop.ts), wherever the app offers to add a card:
 * "Cards" without a card and its "New card", the steps' "Before you start" (AddCardSteps.tsx),
 * "Add a card" on a device that reads no card (AddCardDialog.tsx). A white panel: cards of the
 * shop, what it offers, and "Order cards", which opens the shop in the browser (a new tab on the
 * web, the web app staying in this one). On a phone, two cards standing beside the words, the
 * button under them across the panel (beside the cards, its column is too narrow for its label);
 * on a desktop's page, the words and the button, two cards lying beside them.
 */

/** The cards drawn, decoration: the words beside them say what they show. */
type Cards = { source: ImageSourcePropType; ratio: number };

/* eslint-disable @typescript-eslint/no-require-imports -- bundled images */
/** Two cards standing, one over the other (360 × 404). */
const STANDING: Cards = {
  source: require("../../../assets/images/card-shop-pair.webp"),
  ratio: 360 / 404
};
/** Two cards lying side by side (800 × 542). */
const LYING: Cards = {
  source: require("../../../assets/images/card-shop-duo.webp"),
  ratio: 800 / 542
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The standing cards' width beside the words, on a phone. */
const STANDING_WIDTH = 104;
/** The lying cards' widest, beside the words on a desktop. */
const LYING_MAX_WIDTH = 340;

export function CardShop() {
  const { t } = useTranslation();
  const styles = useStyles();
  const desktop = useIsDesktop();
  const words = (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        {t("cards.shop.title")}
      </Text>
      <Text style={styles.lead}>{t("cards.shop.lead")}</Text>
    </>
  );
  const order = (
    <Button
      variant="secondary"
      size={desktop ? "sm" : "md"}
      icon="bag-shopping"
      accessory={(color) => <Icon name="arrow-up-right-from-square" size={12} color={color} />}
      fullWidth={!desktop}
      // Its label, not its icons' glyphs.
      accessibilityLabel={t("cards.shop.order")}
      onPress={() => openExternal(CARD_SHOP_URL)}
      testID="card-shop-order"
    >
      {t("cards.shop.order")}
    </Button>
  );
  if (desktop) {
    return (
      <View style={[styles.panel, styles.panelRow]} testID="card-shop">
        <View style={styles.wordsRow}>
          {words}
          <View style={styles.action}>{order}</View>
        </View>
        <View style={styles.lying}>
          <Drawn cards={LYING} maxWidth={LYING_MAX_WIDTH} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="card-shop">
      <View style={styles.standing}>
        <Drawn cards={STANDING} width={STANDING_WIDTH} />
        <View style={styles.words}>{words}</View>
      </View>
      {order}
    </View>
  );
}

/**
 * The cards, in a box of their ratio, the image filling it: an image with no size of its own takes
 * its file's on the web (react-native-web), whatever its box.
 */
function Drawn({ cards, width, maxWidth }: { cards: Cards; width?: number; maxWidth?: number }) {
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: width ?? "100%", maxWidth, aspectRatio: cards.ratio, alignSelf: "center" }}
    >
      <Image
        source={cards.source}
        resizeMode="contain"
        style={{ width: "100%", height: "100%" }}
        testID="card-shop-cards"
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  panel: {
    alignSelf: "stretch",
    gap: space[5],
    paddingHorizontal: space[7],
    paddingVertical: space[7],
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  panelRow: { flexDirection: "row", alignItems: "center", gap: space[8], paddingLeft: space[9] },
  standing: { flexDirection: "row", alignItems: "center", gap: space[7] },
  words: { flex: 1, minWidth: 0, gap: 6 },
  wordsRow: { flex: 1.1, minWidth: 0, gap: 6 },
  lying: { flex: 1, minWidth: 0 },
  title: { ...sans(700), fontSize: 17, lineHeight: 22, color: colors.text.primary },
  lead: { ...sans(500), fontSize: 13.5, lineHeight: 20, color: colors.text.secondary },
  action: { marginTop: space[5], alignItems: "flex-start" }
}));
