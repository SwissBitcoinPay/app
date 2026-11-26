import { useIsFocused, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ArticlePhoto } from "@/features/catalog/ArticlesScreen";
import { BarcodeCamera } from "@/features/catalog/BarcodeScanner";
import { useScanBeep } from "@/features/catalog/scan-beep";
import { QuantityStepper, usePriceText } from "@/features/terminal/ArticlesPad";
import {
  NewScannedArticle,
  type NewScannedArticleHandle
} from "@/features/terminal/NewScannedArticle";
import { usePointOfSale } from "@/features/terminal/pos";
import { useBasketSale } from "@/features/terminal/useBasketSale";
import type { Article } from "@/lib/catalog/article";
import { formatFiat } from "@/lib/terminal/amount";
import { articleOfBarcode, quantityOf } from "@/lib/terminal/basket";
import { isMemberProfile } from "@/lib/terminal/model";
import {
  makeStyles,
  mono,
  motion,
  palette,
  proseLineHeight,
  radius,
  sans,
  space,
  TITLE_EM,
  tracking,
  type,
  useTheme
} from "@/theme";

/**
 * How long a code must be out of the camera's sight before it counts again: the camera reports a
 * code at every frame it sees it, an article held under it is one article. The "+" of its card
 * adds more of it.
 */
export const SCAN_REPEAT_GAP_MS = 1500;

/**
 * What the panel shows: what to do, the article read last, a code of no article, or a code read
 * before the catalogue was (nothing can be told of it).
 */
type Shown =
  | { kind: "aim" }
  | { kind: "article"; id: string }
  | { kind: "unknown"; barcode: string }
  | { kind: "notRead"; barcode: string };

/**
 * "Scan" of the point of sale's selector: the camera in the
 * screen, under the selector, then what was read and "Charge". Each barcode read adds its
 * article to the basket, with a till's beep, and its card shows until the next one: its photo,
 * name and price, and − n + for its quantity. A code of no article says so and adds nothing; on
 * the owner's device, locked or not, "New item" shows for it (NewScannedArticle), and the
 * article saved joins the basket as if it had been read. Before the catalogue
 * was read, a code is of no article known: it says so, and offers no "New item" (the
 * article may exist). The basket is "Items"'s: changing the view keeps it. "Charge"
 * fixes the basket's sale and shows its invoice; "View basket" above it, discreet. The amount
 * typed at the keypad is not part of it. The camera runs only while this view shows.
 */
export function ScanPad({ wide }: { wide: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, languageTag, catalog, basket, changeBasket } = usePointOfSale();
  const { total, canCharge, charge, priceOf } = useBasketSale();
  const priceText = usePriceText();
  const beep = useScanBeep();
  const [shown, setShown] = useState<Shown>({ kind: "aim" });
  /**
   * "New item" shows (the owner's device): nothing read meanwhile counts. A ref: the camera
   * may report another code before the next render (two codes in one frame), which must not open
   * the form again over the first one.
   */
  const adding = useRef(false);
  const adder = useRef<NewScannedArticleHandle>(null);
  const units = total.status === "ok" ? total.units : 0;
  // The stack keeps the point of sale mounted under the basket and the invoice: the camera only
  // while it shows, so that nothing read there joins the basket (and the camera is off meanwhile).
  const focused = useIsFocused();

  // When each code was last reported: one still in sight is not read again.
  const seen = useRef(new Map<string, number>());
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  /** One more of `article` in the basket, its card shown with a flash. */
  const add = (article: Article) => {
    changeBasket(article.id, 1);
    setShown({ kind: "article", id: article.id });
    flash.set(1);
    flash.set(withTiming(0, { duration: motion.scanFlash }));
  };

  const scanned = (barcode: string) => {
    const now = Date.now();
    const last = seen.current.get(barcode);
    seen.current.set(barcode, now);
    if (adding.current || (last !== undefined && now - last < SCAN_REPEAT_GAP_MS)) return;
    beep();
    const article = articleOfBarcode(catalog.articles, barcode);
    if (article) {
      add(article);
      return;
    }
    // Not read yet (or unreadable): "no article" is not proven, the article may exist.
    if (catalog.state !== "read") {
      setShown({ kind: "notRead", barcode });
      return;
    }
    setShown({ kind: "unknown", barcode });
    if (adder.current) {
      adding.current = true;
      adder.current.open(barcode);
    }
  };

  const article =
    shown.kind === "article" ? catalog.articles.find(({ id }) => id === shown.id) : undefined;
  const quantity = article ? quantityOf(basket, article.id) : 0;
  const converted = article !== undefined && article.price.currency !== profile.currency;

  const chargeBasket = () => {
    if (charge()) router.push("/pos/charge");
  };

  const codeCard = (barcode: string, title: string, body: string, testID: string) => (
    <View style={styles.card} testID={testID}>
      <View style={[styles.photo, styles.unknownIcon]}>
        <Icon name="barcode" size={26} color={colors.warning.fg} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.name}>{title}</Text>
        <Text style={styles.code}>{barcode}</Text>
        <Text style={styles.original}>{body}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, wide ? styles.rootWide : styles.rootPhone]} testID="pos-scan">
      <View style={[styles.camera, wide ? styles.cameraWide : styles.cameraPhone]}>
        {focused ? <BarcodeCamera onScanned={scanned} /> : null}
      </View>
      <View style={styles.shown}>
        {article ? (
          <View style={styles.card} testID="scan-card">
            <Animated.View style={[styles.flash, flashStyle]} />
            <ArticlePhoto article={article} style={styles.photo} initialsSize={20} />
            <View style={styles.texts}>
              <Text numberOfLines={2} style={styles.name}>
                {article.name}
              </Text>
              <Text style={styles.price}>
                {`${priceText(priceOf(article))} ${profile.currency}`}
              </Text>
              {converted ? (
                <Text style={styles.original}>
                  {t("pos.scan.converted", {
                    price: `${formatFiat(article.price.minor, article.price.digits, languageTag)} ${article.price.currency}`
                  })}
                </Text>
              ) : null}
            </View>
            <QuantityStepper
              name={article.name}
              quantity={quantity}
              onChange={(delta) => changeBasket(article.id, delta)}
              testID="scan-quantity"
            />
          </View>
        ) : shown.kind === "unknown" ? (
          codeCard(
            shown.barcode,
            t("pos.scan.unknown.title"),
            t("pos.scan.unknown.body"),
            "scan-unknown"
          )
        ) : shown.kind === "notRead" ? (
          codeCard(
            shown.barcode,
            t("pos.scan.notRead.title"),
            t("pos.scan.notRead.body"),
            "scan-not-read"
          )
        ) : (
          <View style={styles.aim}>
            <Text accessibilityRole="header" style={styles.title}>
              {t("pos.scan.aim")}
            </Text>
            <Text style={styles.lead}>{t("pos.scan.lead")}</Text>
          </View>
        )}
      </View>
      <View style={styles.basketRow}>
        {basket.length > 0 ? (
          <Button
            variant="text"
            size="sm"
            onPress={() => router.push({ pathname: "/pos/basket", params: { from: "scan" } })}
            testID="scan-basket"
          >
            {t("pos.basket.open")}
          </Button>
        ) : null}
      </View>
      <Button
        onPress={chargeBasket}
        disabled={!canCharge}
        amount={
          canCharge && total.status === "ok"
            ? `${priceText(total.minor)} ${profile.currency}`
            : undefined
        }
        testID="scan-charge"
      >
        {units > 0 ? t("pos.basket.charge", { count: units }) : t("pos.charge")}
      </Button>
      {isMemberProfile(profile) ? null : (
        <NewScannedArticle
          ref={adder}
          profile={profile}
          onSaved={(saved) => {
            adding.current = false;
            add(saved);
          }}
          onClose={() => {
            adding.current = false;
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: space[2] },
  // Phone: the screen's height, the camera taking what the rest leaves.
  rootPhone: { flex: 1, minHeight: 0, paddingBottom: 12 },
  // Wide: a column of its own height in the centred body (no `flex`: on the web, `flex: 0` may
  // shrink to nothing, which hid the camera).
  rootWide: { width: 560, maxWidth: "100%" },
  // The camera in a dark box under the selector.
  camera: {
    marginBottom: space[3],
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: palette.ink
  },
  cameraPhone: { flex: 1, minHeight: 0 },
  cameraWide: { height: 360 },
  // As tall whatever it shows: the buttons under it never move.
  shown: { minHeight: 96, justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: space[5] },
  flash: {
    position: "absolute",
    top: -space[3],
    bottom: -space[3],
    left: -space[3],
    right: -space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.background.accentSubtle,
    pointerEvents: "none"
  },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  unknownIcon: {
    backgroundColor: colors.warning.bg,
    alignItems: "center",
    justifyContent: "center"
  },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  name: {
    ...sans(700),
    fontSize: 16,
    lineHeight: 20,
    color: colors.text.primary
  },
  price: { ...mono(500), fontSize: 15, color: colors.text.secondary },
  code: { ...mono(500), fontSize: 13, color: colors.text.secondary },
  original: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  // Centred under the camera, like the buttons below it.
  aim: { gap: 6 },
  title: {
    ...sans(700),
    fontSize: 20,
    letterSpacing: tracking(TITLE_EM, 20),
    color: colors.text.primary,
    textAlign: "center"
  },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    textAlign: "center"
  },
  basketRow: { height: 44, alignItems: "center", justifyContent: "center" }
}));
