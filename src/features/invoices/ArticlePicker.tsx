import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet, useSheetInset } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { ArticlePhoto } from "@/features/catalog/ArticlesScreen";
import { loadCatalog } from "@/features/catalog/catalog";
import { withCatalogEntry, type Article, type CatalogEntry } from "@/lib/catalog/article";
import { logFailure } from "@/lib/log/log";
import { formatFiat } from "@/lib/terminal/amount";
import { control, makeStyles, mono, radius, sans, space, stroke, type, useTheme } from "@/theme";

/** What the merchant picked: an article of the catalogue, or a line to type. */
export type PickedArticle = { kind: "manual" } | { kind: "article"; article: Article };

export type CatalogState =
  { status: "loading" } | { status: "failed" } | { status: "ready"; articles: Article[] };

/**
 * The business's catalogue, read as soon as the lines' step shows:
 * "Add an item" lists it at once. `retry` reads it again after a failure; `show` lists the articles
 * of a read made since, `remember` an article this device just saved or removed ("Save to my
 * items"), as a read would give it.
 */
export function useCatalogArticles(): {
  catalog: CatalogState;
  retry: () => void;
  show: (articles: Article[]) => void;
  remember: (entry: CatalogEntry) => void;
} {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Bumped by `show`: a read started before it answers older news, never shown.
  const shown = useRef(0);
  // What `remember` was given while a read was on its way: applied to it once it answers.
  const noted = useRef<CatalogEntry[]>([]);
  const reading = useRef(false);

  useEffect(() => {
    let alive = true;
    const started = shown.current;
    reading.current = true;
    loadCatalog().then(
      (read) => {
        if (!alive || shown.current !== started) return;
        reading.current = false;
        // No relay answered: nothing can be told (never "no article").
        const articles = noted.current.reduce<readonly Article[]>(
          (listed, entry) => withCatalogEntry(listed, entry),
          read.articles
        );
        noted.current = [];
        setCatalog(
          read.answered === 0 ? { status: "failed" } : { status: "ready", articles: [...articles] }
        );
      },
      (error: unknown) => {
        logFailure("Reading the catalogue failed", error);
        if (!alive || shown.current !== started) return;
        reading.current = false;
        noted.current = [];
        setCatalog({ status: "failed" });
      }
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = () => {
    setCatalog({ status: "loading" });
    setAttempt((count) => count + 1);
  };
  const remember = (entry: CatalogEntry) => {
    if (reading.current) noted.current = [...noted.current, entry];
    setCatalog((known) =>
      known.status === "ready"
        ? { status: "ready", articles: [...withCatalogEntry(known.articles, entry)] }
        : known
    );
  };
  const show = (articles: Article[]) => {
    shown.current += 1;
    reading.current = false;
    noted.current = [];
    setCatalog({ status: "ready", articles });
  };
  return { catalog, retry, show, remember };
}

/**
 * "Add an item" of "New invoice": an article of the business's catalogue ("Items",
 * src/features/catalog/), its name and price taken, or "Enter an item", a line typed freely. A
 * bottom sheet on mobile, a dialog on desktop (Sheet). The catalogue is the one read when the step
 * showed (useCatalogArticles).
 */
export function ArticlePicker({
  visible,
  catalog,
  onRetry,
  onPick,
  onClose,
  languageTag
}: {
  visible: boolean;
  catalog: CatalogState;
  onRetry: () => void;
  onPick: (picked: PickedArticle) => void;
  onClose: () => void;
  languageTag: string;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("invoices.picker.title")}
      closeLabel={t("invoices.picker.close")}
      visible={visible}
      onClose={onClose}
      testID="invoice-article-picker"
    >
      <PickerBody catalog={catalog} onRetry={onRetry} onPick={onPick} languageTag={languageTag} />
    </Sheet>
  );
}

function PickerBody({
  catalog,
  onRetry,
  onPick,
  languageTag
}: {
  catalog: CatalogState;
  onRetry: () => void;
  onPick: (picked: PickedArticle) => void;
  languageTag: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const inset = useSheetInset();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.list, { marginHorizontal: -inset }]}>
        <ListRow
          inset={inset}
          accessibilityRole="button"
          onPress={() => onPick({ kind: "manual" })}
          style={styles.row}
          testID="invoice-picker-manual"
        >
          <View style={styles.manualIcon}>
            <Icon name="pen" size={14} color={colors.text.accent} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.name}>{t("invoices.picker.manual")}</Text>
            <Text style={styles.description}>{t("invoices.picker.manualDescription")}</Text>
          </View>
        </ListRow>
      </View>
      <Text style={styles.section}>{t("invoices.picker.catalog")}</Text>
      {catalog.status === "loading" ? (
        <View style={styles.status}>
          <Spinner size={18} />
          <Text style={styles.statusText}>{t("invoices.picker.loading")}</Text>
        </View>
      ) : catalog.status === "failed" ? (
        <View style={styles.failed}>
          <ErrorMessage>{t("invoices.picker.failed")}</ErrorMessage>
          <Button variant="secondary" size="md" icon="arrow-rotate-right" onPress={onRetry}>
            {t("invoices.picker.retry")}
          </Button>
        </View>
      ) : catalog.articles.length === 0 ? (
        <Text style={styles.statusText}>{t("invoices.picker.empty")}</Text>
      ) : (
        <View style={[styles.list, { marginHorizontal: -inset }]}>
          {catalog.articles.map((article) => (
            <ListRow
              key={article.id}
              inset={inset}
              accessibilityRole="button"
              onPress={() => onPick({ kind: "article", article })}
              style={styles.row}
              testID={`invoice-picker-article-${article.id}`}
            >
              <ArticlePhoto article={article} style={styles.photo} initialsSize={13} />
              <View style={styles.texts}>
                <Text style={styles.name} numberOfLines={1}>
                  {article.name}
                </Text>
                {article.description ? (
                  <Text style={styles.description} numberOfLines={1}>
                    {article.description}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.price}>
                {`${formatFiat(article.price.minor, article.price.digits, languageTag)} ${article.price.currency}`}
              </Text>
            </ListRow>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  scroll: { maxHeight: 520 },
  content: { paddingBottom: space[5] },
  list: {},
  row: {
    minHeight: control.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    paddingVertical: space[3],
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border.subtle
  },
  manualIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center"
  },
  photo: { width: 40, height: 40, borderRadius: radius.sm },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  description: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  price: { ...mono(500), fontSize: type.label, color: colors.text.primary },
  section: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary,
    marginTop: space[7],
    marginBottom: space[3]
  },
  status: { flexDirection: "row", alignItems: "center", gap: space[4], paddingVertical: space[5] },
  statusText: {
    ...sans(500),
    fontSize: type.prose,
    color: colors.text.secondary,
    paddingVertical: space[5]
  },
  failed: { gap: space[5], paddingVertical: space[4] }
}));
