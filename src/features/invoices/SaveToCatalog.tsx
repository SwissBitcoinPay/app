import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { AddAction } from "@/components/ui/AddAction";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { ARTICLE_NAME_MAX_LENGTH } from "@/config/catalog";
import { ArticlePhoto } from "@/features/catalog/ArticlesScreen";
import type { Article } from "@/lib/catalog/article";
import { currencyDigits } from "@/lib/terminal/amount";
import {
  makeStyles,
  mono,
  proseLineHeight,
  radius,
  sans,
  space,
  tracked,
  type,
  useTheme
} from "@/theme";

import { lineOf, type LineDraft } from "./form";
import type { LineArticle } from "./line-saves";
import { moneyWithCurrency } from "./format";

/*
 * "Save to my items": a line typed by hand, whole, saved to the business's catalogue at once,
 * without asking; its name, its unit price in the invoice's currency (an article has no VAT rate:
 * its format has none). An article of the same name opens a dialog showing it, to add a second one
 * or change that one.
 */

export type { LineArticle } from "./line-saves";

/** The catalogue's name of a line, as addArticle saves it: trimmed. */
export function lineArticle(
  line: LineDraft,
  currency: { code: string; digits: number }
): LineArticle | null {
  const name = line.name.trim();
  // Saved as typed or not at all: an article's name is shorter than a line's.
  if (name === "" || name.length > ARTICLE_NAME_MAX_LENGTH) return null;
  // addArticle reads the price in the currency's own digits: never another scale.
  if (currencyDigits(currency.code) !== currency.digits) return null;
  const read = lineOf(line, currency.digits);
  return read ? { name, priceMinor: read.unitMinor } : null;
}

/** Whether two names are the same article's: trimmed, whatever their case or composition. */
export function sameName(a: string, b: string): boolean {
  return folded(a) === folded(b);
}

/** A name as compared: trimmed, composed ("ü" typed one way or the other), in lower case. */
function folded(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

/** Whether `article` is `typed` already: same name, same price in the invoice's currency. */
export function isArticleOf(
  article: Article,
  typed: LineArticle,
  currency: { code: string; digits: number }
): boolean {
  return (
    sameName(article.name, typed.name) &&
    updatable(article, currency) &&
    article.price.minor === typed.priceMinor
  );
}

/** The link's state on a line: to press, saving, or saved. */
export type SaveState = "idle" | "saving" | "saved";

/**
 * Under a line's fields, in its card: the umber link "Save to my items" (AddAction, as "Add an
 * item"), then "Saved to my items" in green once saved.
 */
export function SaveToCatalogLink({
  state,
  disabled,
  onPress
}: {
  state: SaveState;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (state === "saved") {
    return (
      <View style={styles.saved} testID="invoice-line-saved">
        <Icon name="check" size={12} color={colors.success.fg} />
        <Text style={styles.savedLabel}>{t("invoices.lines.saved")}</Text>
      </View>
    );
  }
  return (
    <AddAction
      label={t("invoices.lines.save")}
      icon="bookmark"
      onPress={onPress}
      disabled={disabled}
      busy={state === "saving"}
      busyTestID="invoice-line-saving"
      testID="invoice-line-save"
    />
  );
}

/** Whether a price in the invoice's currency can replace `article`'s: of the same currency. */
export function updatable(article: Article, currency: { code: string; digits: number }): boolean {
  return article.price.currency === currency.code && article.price.digits === currency.digits;
}

type Conflict = { article: Article; typed: LineArticle };

/**
 * The article of the same name, shown as "Items" lists it, with the price the line would give it:
 * "Update the item" gives that one the line's price, "Create a duplicate" adds another article. An
 * article of another currency is never updated from the invoice (its price stays in its own
 * currency, updateArticle): a duplicate only.
 */
export function SameNameSheet({
  conflict,
  currency,
  languageTag,
  onDuplicate,
  onUpdate,
  onClose
}: {
  conflict: Conflict | null;
  currency: { code: string; digits: number };
  languageTag: string;
  onDuplicate: () => void;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // Drawn as last shown while the panel leaves (Sheet outlives `visible` by its exit animation).
  const [shown, setShown] = useState<Conflict | null>(conflict);
  if (conflict !== null && conflict !== shown) setShown(conflict);
  const canUpdate = shown !== null && updatable(shown.article, currency);
  return (
    <Sheet
      title={t("invoices.sameName.title")}
      closeLabel={t("invoices.sameName.close")}
      visible={conflict !== null}
      onClose={onClose}
      testID="invoice-same-name"
    >
      {shown ? (
        <View style={styles.sheet}>
          <Text style={styles.lead}>
            {canUpdate
              ? t("invoices.sameName.lead")
              : t("invoices.sameName.otherCurrency", {
                  currency: shown.article.price.currency,
                  invoice: currency.code
                })}
          </Text>
          <View style={styles.preview} testID="invoice-same-name-article">
            <ArticlePhoto article={shown.article} style={styles.photo} initialsSize={13} />
            <View style={styles.texts}>
              <Text style={styles.name} numberOfLines={1}>
                {shown.article.name}
              </Text>
              {shown.article.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {shown.article.description}
                </Text>
              ) : null}
            </View>
            <Text style={styles.price}>
              {moneyWithCurrency(
                shown.article.price.minor,
                { code: shown.article.price.currency, digits: shown.article.price.digits },
                languageTag
              )}
            </Text>
          </View>
          <Text style={styles.newPrice}>
            {t("invoices.sameName.newPrice", {
              price: moneyWithCurrency(shown.typed.priceMinor, currency, languageTag)
            })}
          </Text>
          <View style={styles.actions}>
            {canUpdate ? (
              <Button onPress={onUpdate} testID="invoice-same-name-update">
                {t("invoices.sameName.update")}
              </Button>
            ) : null}
            {/* Another variant: another button (never a background changed inside a Modal). */}
            <Button
              key={canUpdate ? "duplicate-secondary" : "duplicate-primary"}
              variant={canUpdate ? "secondary" : "primary"}
              size={canUpdate ? "md" : "lg"}
              onPress={onDuplicate}
              testID="invoice-same-name-duplicate"
            >
              {t("invoices.sameName.duplicate")}
            </Button>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // AddAction's row, in green.
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    alignSelf: "flex-start",
    height: 40
  },
  savedLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.success.fg
  },
  sheet: { gap: space[6] },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    padding: space[5],
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  photo: { width: 40, height: 40, borderRadius: radius.sm },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...sans(600), fontSize: type.body, color: colors.text.primary },
  description: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  price: { ...mono(500), fontSize: type.label, color: colors.text.primary },
  newPrice: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  actions: { gap: space[4] }
}));
