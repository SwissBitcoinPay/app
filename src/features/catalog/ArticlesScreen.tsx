import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ArticleCashArt,
  ArticleCreateArt,
  ArticleTapArt
} from "@/components/illustrations/articles";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingScene, useLoadingScene } from "@/components/ui/LoadingScene";
import { useHover } from "@/components/ui/useHover";
import { guideStep, ListGuide } from "@/features/empty-states/guide";
import { useImageUri } from "@/features/media/images";
import { DockActions, DockScrollView } from "@/features/navigation/dock-area";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import type { Article } from "@/lib/catalog/article";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatFiat, formatFiatPlain } from "@/lib/terminal/amount";
import {
  cardInset,
  gutter,
  makeStyles,
  mono,
  radius,
  sans,
  space,
  TITLE_EM,
  tracking,
  type
} from "@/theme";

import {
  ArticleSheet,
  EMPTY_DRAFT,
  codeOf,
  scannedDraft,
  useEpochRead,
  useProductSearch,
  type Draft,
  type Failure
} from "./ArticleSheet";
import { BarcodeScanner, useCanScanBarcodes } from "./BarcodeScanner";
import { loadCatalog, removeArticle } from "./catalog";

/** Desktop grid: cards of 220 px at least, 22 px apart, 4 in a 1440 px window. */
const CARD_MIN_WIDTH = 220;
const GRID_GAP = 22;
const MAX_COLUMNS = 6;
/**
 * An article's initials without a photo (on sand):
 * the first letters of its first two words, apostrophes and hyphens splitting words too
 * ("Coca-Cola" → "CC").
 */
export function articleInitials(name: string): string {
  return name
    .split(/[\s'’-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/**
 * "Items". The owner's only: the account is open (the passkey). Mobile: a list in a card (photo,
 * name, the start of the description, price) and "Add an item" pinned at the bottom, which opens a
 * bottom sheet ("Scan" in its header, with a camera). Desktop: a grid of cards (the photo large,
 * two lines of description) and a panel sliding in from the right. Without a photo, the name's
 * initials on sand. A row or a card opens the article in the same panel, "Edit the item", with
 * "Delete the item", which asks to confirm. No categories nor VAT (the point of sale will use them
 * later).
 */
export function ArticlesScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  /**
   * On a phone ("Scan" in the mobile sheet only), the apps' or the web app's with a camera.
   */
  const canScan = useCanScanBarcodes() && !desktop;
  const { notify } = useNotifications();
  const { noteCatalogEntry } = usePos();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [offline, setOffline] = useState(false);
  const [newer, setNewer] = useState(false);
  const [adding, setAdding] = useState(false);
  /** The article the form changes; null for a new one. */
  const [editing, setEditing] = useState<Article | null>(null);
  /** The article whose removal is asked to confirm. */
  const [removing, setRemoving] = useState<Article | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /** Opened again for each form shown: its fields mount afresh and take their focus. */
  const [formKey, setFormKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const { search, lookUp, drop: dropSearch } = useProductSearch(setDraft, languageTag);
  // The team's roster read again in the background as the form opens: a removal made on another of
  // the owner's devices is known before the article is sealed ("Save" waits for it).
  const { epoch, read: readEpoch } = useEpochRead();
  const loads = useRef(0);

  const reload = useCallback(() => {
    const load = ++loads.current;
    loadCatalog().then(
      (read) => {
        if (load !== loads.current) return;
        setArticles((shown) => (read.answered === 0 && shown ? shown : read.articles));
        setOffline(read.answered === 0);
        setNewer(read.newerUnreadable);
        setLoadFailure(null);
      },
      (error: unknown) => {
        if (load === loads.current) setLoadFailure(codeOf(error));
      }
    );
  }, []);
  useFocusEffect(reload);

  const openForm = (next: Draft) => {
    setDraft(next);
    setFormKey((key) => key + 1);
    setAdding(true);
  };

  const closeForm = () => {
    dropSearch();
    setAdding(false);
  };

  const openAdd = () => {
    void readEpoch();
    dropSearch();
    setEditing(null);
    openForm(EMPTY_DRAFT);
  };

  const openEdit = (article: Article) => {
    void readEpoch();
    dropSearch();
    setEditing(article);
    openForm({
      name: article.name,
      description: article.description,
      descriptionOpen: article.description !== "",
      price: formatFiatPlain(article.price.minor, article.price.digits, languageTag),
      photo: null,
      barcode: article.barcode,
      filled: false,
      focus: null
    });
  };

  // `editing` stays while the sheet leaves (its title and buttons unchanged): openAdd clears it.
  const saved = (article: Article, changed: boolean) => {
    closeForm();
    // The point of sale has it at once (its scan finds it), without waiting for its next read.
    noteCatalogEntry(article);
    // A new one first; a changed one stays in its place (the list is by when they were added).
    setArticles((shown) =>
      changed
        ? (shown ?? []).map((known) => (known.id === article.id ? article : known))
        : [article, ...(shown ?? []).filter(({ id }) => id !== article.id)]
    );
    notify({
      tone: "success",
      title: t(changed ? "articles.changed.title" : "articles.saved.title"),
      body: t(changed ? "articles.changed.body" : "articles.saved.body", { name: article.name }),
      key: "articles"
    });
  };

  // One panel at a time: the form closes, the confirmation shows; "Back" leaves the article.
  const askRemoval = (article: Article) => {
    closeForm();
    setRemoving(article);
  };

  const confirmRemoval = () => {
    const article = removing;
    setRemoving(null);
    if (!article) return;
    removeArticle(article).then(
      (removal) => {
        noteCatalogEntry(removal);
        setArticles((shown) => (shown ?? []).filter(({ id }) => id !== article.id));
        notify({
          tone: "success",
          title: t("articles.removed.title"),
          body: t("articles.removed.body", { name: article.name }),
          key: "articles"
        });
      },
      (error: unknown) =>
        notify({
          tone: "error",
          title: t("articles.errors.removeTitle"),
          body: t(`articles.errors.${codeOf(error)}`),
          key: "articles"
        })
    );
  };

  // The scanner replaces the sheet (one panel at a time), which shows again as soon as a barcode is
  // read: Open Food Facts is asked meanwhile, the name and the photo not editable, with a spinner,
  // until they come.
  const startScan = () => {
    closeForm();
    setScanning(true);
  };
  const backToForm = (next: Draft) => {
    setScanning(false);
    openForm(next);
  };
  const scanned = (barcode: string) => {
    // An article changed keeps the photo it shows: none is downloaded. A new article takes Open
    // Food Facts' photo, even over one picked before the scan.
    const keepPhoto = editing !== null && (editing.image !== null || draft.photo !== null);
    const form = scannedDraft(draft, barcode);
    backToForm(form);
    lookUp(barcode, form, keepPhoto);
  };

  const notices = (
    <>
      {loadFailure ? (
        <ErrorMessage testID="articles-failure">{t(`articles.errors.${loadFailure}`)}</ErrorMessage>
      ) : null}
      {offline ? <ErrorMessage>{t("articles.offline")}</ErrorMessage> : null}
      {newer ? <ErrorMessage>{t("articles.newer")}</ErrorMessage> : null}
    </>
  );

  // Its loading scene (useLoadingScene): it fades out once read, then the items fade in.
  const waitScene = useLoadingScene(
    articles === null && !loadFailure
      ? { scene: "articles", label: t("articles.loading"), testID: "articles-loading" }
      : null
  );
  const waited = waitScene.waited;
  // Not read yet, or its scene fading out: the items wait.
  const pending = articles === null || waitScene.scene !== null;
  const body = waitScene.scene ? (
    <View style={styles.loading}>
      <LoadingScene {...waitScene.scene} />
    </View>
  ) : articles === null ? null : articles.length === 0 && !offline ? (
    <ArticlesGuide desktop={desktop} canScan={canScan} />
  ) : null;

  const price = (article: Article) =>
    `${formatFiat(article.price.minor, article.price.digits, languageTag)} ${article.price.currency}`;

  return (
    <>
      {desktop ? (
        <DesktopLayout
          title={t("navigation.destinations.articles")}
          addLabel={t("articles.add")}
          onAdd={openAdd}
          notices={notices}
          body={body}
          loading={pending}
          arrival={waited}
          articles={articles ?? []}
          price={price}
          onOpen={openEdit}
        />
      ) : (
        // The list runs under "Add an item" and the dock, both floating over it.
        <PosFrame title={t("navigation.destinations.articles")} flush="mobile">
          <DockScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              waitScene.scene !== null && styles.scrollLoading
            ]}
            showsVerticalScrollIndicator={false}
            testID="articles"
          >
            {notices}
            {pending ? (
              body
            ) : (
              <Arrival fade={waited} style={styles.arrival}>
                {body}
                {articles && articles.length > 0 ? (
                  <View style={styles.card}>
                    {articles.map((article, index) => (
                      <ListRow
                        key={article.id}
                        inset={cardInset}
                        cornerRadius={radius.lg}
                        accessibilityRole="button"
                        accessibilityHint={t("articles.openHint")}
                        onPress={() => openEdit(article)}
                        style={[styles.row, index < articles.length - 1 && styles.rowSeparated]}
                        testID={`article-${article.id}`}
                      >
                        <ArticlePhoto article={article} style={styles.rowPhoto} initialsSize={14} />
                        <View style={styles.rowTexts}>
                          <Text numberOfLines={1} style={styles.name}>
                            {article.name}
                          </Text>
                          {article.description ? (
                            <Text numberOfLines={1} style={styles.description}>
                              {article.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={styles.rowPrice}>
                          {price(article)}
                        </Text>
                      </ListRow>
                    ))}
                  </View>
                ) : null}
              </Arrival>
            )}
          </DockScrollView>
          <DockActions style={styles.mobileAction}>
            <Button icon="plus" onPress={openAdd} testID="add-article">
              {t("articles.add")}
            </Button>
          </DockActions>
        </PosFrame>
      )}

      <ArticleSheet
        key={formKey}
        visible={adding}
        draft={draft}
        onDraft={setDraft}
        editing={editing}
        count={articles?.length ?? 0}
        languageTag={languageTag}
        search={search}
        epoch={epoch}
        onReadEpoch={readEpoch}
        onClose={closeForm}
        onScan={canScan ? startScan : null}
        onSaved={saved}
        onRemove={askRemoval}
      />
      <ConfirmDialog
        visible={removing !== null}
        title={removing ? t("articles.removeDialog.title", { name: removing.name }) : ""}
        body={t("articles.removeDialog.body")}
        confirmLabel={t("articles.removeDialog.confirm")}
        cancelLabel={t("common.back")}
        onConfirm={confirmRemoval}
        onCancel={() => setRemoving(null)}
        testID="remove-article"
        confirmTestID="confirm-remove-article"
      />
      {/* Only where a scan can start (its beep is loaded with it), or while one shows (the layout
          turned to desktop meanwhile). */}
      {canScan || scanning ? (
        <BarcodeScanner
          visible={scanning}
          onScanned={scanned}
          onManual={() => backToForm(draft)}
          onClose={() => backToForm(draft)}
        />
      ) : null}
    </>
  );
}

/** An article's photo, else its initials on sand. */
export function ArticlePhoto({
  article,
  style,
  initialsSize
}: {
  article: Pick<Article, "name" | "image">;
  style: object;
  initialsSize: number;
}) {
  const styles = useStyles();
  const uri = useImageUri(article.image);
  return (
    <View style={[styles.photo, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={[styles.initials, { fontSize: initialsSize }]}>
          {articleInitials(article.name)}
        </Text>
      )}
    </View>
  );
}

/**
 * Without an article (the catalogue read): what it does, in three steps, "Add an item" under it on
 * a phone, in the header on a desktop.
 * The barcode's scan said only where the form offers it (`canScan`, not on a desktop nor the web).
 */
function ArticlesGuide({ desktop, canScan }: { desktop: boolean; canScan: boolean }) {
  const { t } = useTranslation();
  const create = guideStep(t, "articles.guide.create", ArticleCreateArt);
  return (
    <ListGuide
      title={t("articles.guide.title")}
      lead={t("articles.guide.lead")}
      steps={[
        canScan ? create : { ...create, caption: t("articles.guide.create.captionNoScan") },
        guideStep(t, "articles.guide.tap", ArticleTapArt),
        guideStep(t, "articles.guide.cash", ArticleCashArt)
      ]}
      desktop={desktop}
      testID="articles-empty"
    />
  );
}

/**
 * Desktop: the wallet's 108 px header with "Add an item", then a grid of cards on the cream: the
 * photo (168 px high), the name, two lines of description, the price.
 */
function DesktopLayout({
  title,
  addLabel,
  onAdd,
  notices,
  body,
  loading,
  arrival,
  articles,
  price,
  onOpen
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  notices: ReactNode;
  body: ReactNode;
  /** The items not read yet, or their loading scene fading out: `body` is that scene. */
  loading: boolean;
  /** Its loading scene shown: the grid fades in (Arrival.tsx). */
  arrival: boolean;
  articles: Article[];
  price: (article: Article) => string;
  /** A card opens its article, to change or remove it. */
  onOpen: (article: Article) => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const columns =
    width > 0
      ? Math.min(
          MAX_COLUMNS,
          Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)))
        )
      : 4;
  const cardWidth = width > 0 ? (width - GRID_GAP * (columns - 1)) / columns : undefined;
  return (
    <View style={[styles.desktop, { paddingTop: insets.top }]}>
      <View style={styles.desktopHeader}>
        <Text accessibilityRole="header" style={styles.desktopTitle}>
          {title}
        </Text>
        <Button
          variant="primary"
          size="md"
          icon="plus"
          fullWidth={false}
          style={styles.desktopAdd}
          onPress={onAdd}
          testID="add-article"
        >
          {addLabel}
        </Button>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.desktopBody,
          loading && styles.scrollLoading,
          { paddingBottom: Math.max(insets.bottom, 26) }
        ]}
        testID="articles"
      >
        {notices}
        {loading ? (
          body
        ) : (
          <Arrival fade={arrival} style={styles.arrival}>
            {body}
            <View
              style={styles.grid}
              onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            >
              {articles.map((article) => (
                <GridCard
                  key={article.id}
                  article={article}
                  price={price(article)}
                  width={cardWidth}
                  onPress={() => onOpen(article)}
                />
              ))}
            </View>
          </Arrival>
        )}
      </ScrollView>
    </View>
  );
}

/** A card of the desktop grid: pressed, it opens its article; the pointer over it tints it. */
function GridCard({
  article,
  price,
  width,
  onPress
}: {
  article: Article;
  price: string;
  width: number | undefined;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("articles.openHint")}
      onPress={onPress}
      {...hoverProps}
      style={[styles.gridCard, { width }]}
      testID={`article-${article.id}`}
    >
      {({ pressed }) => (
        <>
          <ArticlePhoto article={article} style={styles.gridPhoto} initialsSize={26} />
          <View style={styles.gridTexts}>
            <Text numberOfLines={1} style={styles.name}>
              {article.name}
            </Text>
            <Text numberOfLines={2} style={styles.gridDescription}>
              {article.description}
            </Text>
            <Text numberOfLines={1} style={styles.gridPrice}>
              {price}
            </Text>
          </View>
          {hovered || pressed ? <View style={styles.gridTint} /> : null}
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1, alignSelf: "stretch" },
  scrollContent: { gap: space[5], paddingHorizontal: gutter, paddingBottom: space[5] },
  // The items, once read: their parts as far apart as in the scroll that holds them.
  arrival: { gap: space[5] },
  // The loading scene, in the middle of the page under its header: the scroll fills the page
  // while it shows (scrollLoading), the scene its rest.
  scrollLoading: { flexGrow: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  mobileAction: { paddingTop: 14, paddingHorizontal: gutter },

  // Mobile: rows of 72 px in a white card, its rows from 16 px.
  // Its rows reach its edges (ListRow takes the inset back), clipped to its corners.
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    overflow: "hidden"
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[5], height: 72 },
  rowSeparated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rowPhoto: { width: 48, height: 48, borderRadius: radius.sm },
  rowTexts: { flex: 1, minWidth: 0, gap: space[1] },
  name: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  description: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  rowPrice: { ...mono(700), flexShrink: 0, fontSize: 14, color: colors.text.primary },
  photo: {
    overflow: "hidden",
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center"
  },
  initials: { ...sans(700), color: colors.text.secondary },

  // Desktop (the header of the wallet's screen).
  desktop: { flex: 1, backgroundColor: colors.background.app },
  desktopHeader: {
    height: 108,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 22,
    paddingTop: 30,
    paddingHorizontal: 38,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  desktopTitle: {
    ...sans(700),
    fontSize: 26,
    letterSpacing: tracking(TITLE_EM, 26),
    color: colors.text.primary
  },
  desktopAdd: { minWidth: 236 },
  desktopBody: { paddingTop: 26, paddingHorizontal: 38, gap: space[5] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    overflow: "hidden"
  },
  gridPhoto: { height: 168 },
  gridTint: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.hoverOverlay,
    pointerEvents: "none"
  },
  gridTexts: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 4, minWidth: 0 },
  gridDescription: {
    ...sans(500),
    height: 36,
    fontSize: type.caption,
    lineHeight: type.caption * 1.45,
    color: colors.text.secondary
  },
  gridPrice: { ...mono(700), marginTop: 6, fontSize: 15, color: colors.text.primary }
}));
