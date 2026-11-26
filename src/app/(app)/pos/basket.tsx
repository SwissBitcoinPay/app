import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { ArticlePhoto } from "@/features/catalog/ArticlesScreen";
import { QuantityStepper, usePriceText } from "@/features/terminal/ArticlesPad";
import { NOTE_MAX_LENGTH, NoteCaption } from "@/features/terminal/NoteCaption";
import { PosFrame, POS_COLUMN_WIDTH, posColumn } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { useBasketSale } from "@/features/terminal/useBasketSale";
import { formatInteger } from "@/lib/locale/format";
import { gutter, makeStyles, mono, radius, sans, space, type } from "@/theme";

/**
 * "Basket" of the point of sale ("View basket" of "Items" and of
 * the scan): its lines, each its photo, name, unit price times quantity and − n + (a line
 * at 0 leaves), the total, the sale's note (NoteCaption), and "Charge", which fixes the sale
 * and shows its invoice. From the scan, "Scan more items" goes back to it. On desktop (no side bar
 * over this screen), "Back" under "Charge".
 */
export default function BasketScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { profile, catalog, basket, changeBasket, note, setNote, languageTag } = usePos();
  const { total, canCharge, charge, priceOf } = useBasketSale();
  const priceText = usePriceText();
  const units = total.status === "ok" ? total.units : 0;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/pos"));

  const encaisser = () => {
    if (charge()) router.push("/pos/charge");
  };

  const lines = basket.flatMap((line) => {
    const article = catalog.articles.find(({ id }) => id === line.id);
    return article ? [{ article, quantity: line.quantity }] : [];
  });

  return (
    <PosFrame
      title={t("pos.basket.title")}
      desktopTitle={t("pos.basket.title")}
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: "basket-back"
      }}
      flush="mobile"
    >
      <KeyboardAwareScrollView
        style={desktop ? styles.desktopScroll : styles.scroll}
        // Mobile: its margin only, the bottom safe area is the shell's band below the hidden dock;
        // the point of sale's column (a tablet) drawn by the content, the scroll view keeping the
        // screen's whole width (flush).
        contentContainerStyle={[
          styles.body,
          desktop ? null : posColumn,
          { paddingBottom: desktop ? 0 : space[6] }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {lines.length === 0 ? (
          <Text style={styles.empty}>{t("pos.basket.empty")}</Text>
        ) : (
          <View style={styles.card}>
            {lines.map(({ article, quantity }, index) => {
              const unit = priceOf(article);
              return (
                <View
                  key={article.id}
                  style={[styles.row, index > 0 ? styles.rowSeparated : null]}
                  testID={`basket-line-${article.id}`}
                >
                  <ArticlePhoto article={article} style={styles.photo} initialsSize={13} />
                  <View style={styles.texts}>
                    <Text numberOfLines={1} style={styles.name}>
                      {article.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.sum}>
                      {`${priceText(unit)} × ${formatInteger(quantity, languageTag)}`}
                    </Text>
                  </View>
                  <QuantityStepper
                    name={article.name}
                    quantity={quantity}
                    onChange={(delta) => changeBasket(article.id, delta)}
                    testID={`basket-quantity-${article.id}`}
                  />
                </View>
              );
            })}
            <View style={[styles.row, styles.rowSeparated, styles.totalRow]}>
              <Text style={styles.totalLabel}>{t("pos.basket.total")}</Text>
              <Text style={styles.totalAmount} testID="basket-total">
                {total.status === "ok"
                  ? `${priceText(total.minor)} ${profile.currency}`
                  : total.status === "tooLarge"
                    ? t("pos.basket.tooLarge")
                    : t("pos.rateUnavailable")}
              </Text>
            </View>
          </View>
        )}
        <NoteCaption
          note={note}
          onChange={setNote}
          maxLength={NOTE_MAX_LENGTH}
          languageTag={languageTag}
          onEditingChange={() => undefined}
        />
        <View style={styles.actions}>
          <Button
            onPress={encaisser}
            disabled={!canCharge}
            amount={
              canCharge && total.status === "ok"
                ? `${priceText(total.minor)} ${profile.currency}`
                : undefined
            }
            testID="basket-charge"
          >
            {units > 0 ? t("pos.basket.charge", { count: units }) : t("pos.charge")}
          </Button>
          {from === "scan" ? (
            <Button variant="text" size="md" onPress={back} testID="basket-scan-more">
              {t("pos.basket.scanMore")}
            </Button>
          ) : desktop ? (
            <Button variant="text" size="md" onPress={back}>
              {t("common.back")}
            </Button>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </PosFrame>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1 },
  desktopScroll: { width: POS_COLUMN_WIDTH, maxWidth: "100%" },
  body: { flexGrow: 1, gap: space[6], paddingHorizontal: gutter },
  empty: {
    ...sans(500),
    fontSize: type.prose,
    color: colors.text.secondary,
    textAlign: "center",
    paddingVertical: space[10]
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    paddingHorizontal: space[6]
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[5], minHeight: 68 },
  rowSeparated: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  photo: { width: 40, height: 40, borderRadius: radius.sm },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...sans(600), fontSize: type.body, color: colors.text.primary },
  sum: { ...mono(500), fontSize: type.caption, color: colors.text.secondary },
  totalRow: { justifyContent: "space-between", minHeight: 56 },
  totalLabel: { ...sans(700), fontSize: type.body, color: colors.text.primary },
  totalAmount: { ...mono(700), fontSize: 16, color: colors.text.primary, flexShrink: 1 },
  // At the bottom, the space between the note and them growing (the body grows to the screen).
  actions: { marginTop: "auto", gap: space[2] }
}));
