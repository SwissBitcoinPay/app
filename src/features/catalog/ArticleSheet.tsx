import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewInstance
} from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AddAction } from "@/components/ui/AddAction";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Popover } from "@/components/ui/Popover";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { useHover } from "@/components/ui/useHover";
import {
  ARTICLE_DESCRIPTION_MAX_LENGTH,
  ARTICLE_NAME_MAX_LENGTH,
  getOpenFoodFactsEmail
} from "@/config/catalog";
import { imageUri, useImageUri } from "@/features/media/images";
import { PickImageError, pickImageToSquare, type ImageSource } from "@/features/media/pick-image";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { fiatPlaceholder, parseFiatMinor } from "@/features/wallet/send/amount";
import { getAppInfo } from "@/lib/app-info";
import { isRemoval, type Article } from "@/lib/catalog/article";
import { lookUpProduct, openFoodFactsUserAgent } from "@/lib/catalog/open-food-facts";
import { logFailure } from "@/lib/log/log";
import {
  control as controlSize,
  makeStyles,
  mono,
  radius,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

import {
  CatalogError,
  addArticle,
  changesArticle,
  priceCurrency,
  priceCurrencyOf,
  refreshCatalogEpoch,
  updateArticle,
  type CatalogErrorCode
} from "./catalog";
import { usePhotoDrop } from "./photo-drop";
import { productLookupAllowed } from "./product-lookup";
import { productPhoto } from "./product-photo";

/** Desktop: the dialog's width (as "Send"'s). */
const DIALOG_WIDTH = 560;
/**
 * Desktop: the photo's zone over the fields, low enough for the whole form of an article changed
 * (its description open, "Delete the item" under it) to show in the dialog's greatest height
 * without scrolling.
 */
const ZONE_HEIGHT = 170;
/** The photo's menu in the apps: "Take a photo", "Choose from your photos". */
const PHOTO_MENU_WIDTH = 256;
const PHOTO_MENU_INSET = space[6];

/** What a failure says (`articles.errors.<code>`). */
export type Failure = CatalogErrorCode | "photoDenied" | "cameraDenied" | "photoUnreadable";

export function codeOf(error: unknown): Failure {
  if (error instanceof CatalogError) return error.code;
  if (error instanceof PickImageError) {
    if (error.code === "denied") return "photoDenied";
    return error.code === "cameraDenied" ? "cameraDenied" : "photoUnreadable";
  }
  logFailure("Catalogue action failed", error);
  return "unreachable";
}

/**
 * The form of "New item" or "Edit the item", kept by the screen while the scanner shows over it.
 */
export type Draft = {
  name: string;
  description: string;
  /** The description's field shown ("Add a description" pressed, or a text in it). */
  descriptionOpen: boolean;
  price: string;
  /** A photo picked or scanned: a square JPEG; null keeps the article's (or none). */
  photo: Uint8Array | null;
  /**
   * The EAN / UPC scanned, null when none was: taken as soon as it is read, whatever Open Food
   * Facts answers (the point of sale's scan finds the article by it, src/features/terminal/ScanPad.tsx).
   */
  barcode: string | null;
  /** Open Food Facts filled the name or the photo in this form ("from Open Food Facts"). */
  filled: boolean;
  /**
   * The field focused when the form shows: the name of a new article, the price after a scan, none
   * when an article opens to be changed. Turned to the name while the form shows, it moves there
   * (TextField): no name from Open Food Facts for a scan (unknown, without one, no answer); to the
   * description as "Add a description" opens it. A description open before a scan keeps it no more:
   * the price takes it as the form shows again.
   */
  focus: "name" | "price" | "description" | null;
};

/**
 * The catalogue's epoch, read again on the relays as the form opens (refreshCatalogEpoch): "Save"
 * waits for it, and saves nothing without it (epoch null).
 */
export type EpochRead = { status: "reading" } | { status: "read"; epoch: number | null };

/**
 * The catalogue's epoch as the form shows it (EpochRead), and `read`, which reads it again on the
 * relays (refreshCatalogEpoch): as the form opens, and by "Save" when none was told. Only the
 * latest read counts.
 */
export function useEpochRead(): { epoch: EpochRead; read: () => Promise<number | null> } {
  const [epoch, setEpoch] = useState<EpochRead>({ status: "reading" });
  /** Each read of the epoch's number: only the latest one counts. */
  const reads = useRef(0);
  const read = (): Promise<number | null> => {
    const current = ++reads.current;
    setEpoch({ status: "reading" });
    return refreshCatalogEpoch().then((value) => {
      if (current === reads.current) setEpoch({ status: "read", epoch: value });
      return value;
    });
  };
  return { epoch, read };
}

/**
 * A photo picked or dropped while it is made a square JPEG (pickImageToSquare, photo-drop.web.ts):
 * `preparing` until its bytes settle, then `onPhoto` with them (null: no image, nothing taken). A
 * failure is logged and told (`onFailure`), never a photo silently left out. Only the latest
 * preparation counts, and none once the form is gone (unmounted: each form shown mounts afresh).
 */
function usePhotoPreparation(
  onPhoto: (photo: Uint8Array) => void,
  onFailure: (failure: Failure) => void
): { preparing: boolean; prepare: (bytes: Promise<Uint8Array | null>) => void } {
  const [preparing, setPreparing] = useState(false);
  /** Each preparation's number: only the latest one counts. */
  const preparations = useRef(0);
  /** The form still shows (mounted): a photo made once it is gone fills no other one. */
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  const prepare = (bytes: Promise<Uint8Array | null>) => {
    const current = ++preparations.current;
    const counts = () => shown.current && current === preparations.current;
    setPreparing(true);
    bytes.then(
      (photo) => {
        if (!counts()) return;
        setPreparing(false);
        if (photo) onPhoto(photo);
      },
      (error: unknown) => {
        // In the journal even once the form is gone; said only in its own form.
        logFailure("Preparing an item's photo failed", error);
        if (!counts()) return;
        setPreparing(false);
        onFailure("photoUnreadable");
      }
    );
  };
  return { preparing, prepare };
}

/**
 * A scanned barcode Open Food Facts is asked about, the form shown meanwhile: what it may still
 * fill, each with a spinner and not editable until its answer.
 */
export type ProductSearch = {
  barcode: string;
  /** The name: until Open Food Facts answers. */
  name: boolean;
  /** The photo: until it answers, then until its front photo is downloaded. */
  photo: boolean;
};

/**
 * The cursor to the name, Open Food Facts having given none for a scan: when the form holds none,
 * and only if nothing was typed since `scanned` (the form as the scan left it): the cursor stays in
 * the field being typed in.
 */
const nameAwaited =
  (scanned: Draft) =>
  (current: Draft): Draft =>
    current.name === "" &&
    current.price === scanned.price &&
    current.description === scanned.description &&
    current.descriptionOpen === scanned.descriptionOpen
      ? { ...current, focus: "name" }
      : current;

export const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  descriptionOpen: false,
  price: "",
  photo: null,
  barcode: null,
  filled: false,
  focus: "name"
};

/**
 * `draft` once `barcode` was scanned, before Open Food Facts answers: the barcode taken at once,
 * the cursor on the price (name and photo come from Open Food Facts, never a price).
 */
export function scannedDraft(draft: Draft, barcode: string): Draft {
  return { ...draft, barcode, filled: false, focus: "price" };
}

/**
 * Open Food Facts asked about a scanned barcode while its form shows, when the owner allows it
 * (product-lookup.ts):
 * `search` tells what is still awaited, `lookUp` fills the name and the photo of the form through
 * `setDraft` as they come, `drop` makes an answer still awaited fill nothing (the form closed, or
 * another opened). A product unknown, or no answer, is said in a notification, the cursor moved to
 * the name (nameAwaited); the barcode stays in the form either way (scannedDraft).
 */
export function useProductSearch(
  setDraft: (update: (draft: Draft) => Draft) => void,
  languageTag: string
) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [search, setSearch] = useState<ProductSearch | null>(null);
  /**
   * Each scan's number: a lookup answered after its form was closed, or another one opened, fills
   * nothing.
   */
  const scans = useRef(0);

  const drop = () => {
    scans.current += 1;
    setSearch(null);
  };

  /**
   * Looks `barcode` up, `form` being the form as the scan left it (scannedDraft). `keepPhoto`: the
   * form keeps the photo it shows, none is downloaded.
   */
  const lookUp = (barcode: string, form: Draft, keepPhoto: boolean) => {
    const scan = ++scans.current;
    setSearch({ barcode, name: true, photo: !keepPhoto });
    // The owner's choice first ("Look up scanned products", product-lookup.ts): off, or not known,
    // nothing is asked and the name is typed.
    void productLookupAllowed().then((allowed) => {
      if (scan !== scans.current) return;
      if (allowed) {
        ask(scan, barcode, form, keepPhoto);
        return;
      }
      setSearch(null);
      setDraft(nameAwaited(form));
    });
  };

  /** Asks Open Food Facts about `barcode`, for the scan numbered `scan`. */
  const ask = (scan: number, barcode: string, form: Draft, keepPhoto: boolean) => {
    const userAgent = openFoodFactsUserAgent(getAppInfo().version, getOpenFoodFactsEmail());
    void lookUpProduct(barcode, { userAgent, language: languageTag.split("-")[0] ?? "fr" }).then(
      async (lookup) => {
        if (scan !== scans.current) return;
        if (lookup.status !== "found") {
          setSearch(null);
          // Unknown, or no answer: the cursor goes to the name, which the owner types, unless the
          // form holds one or the owner typed elsewhere since (nameAwaited).
          setDraft(nameAwaited(form));
          notify({
            tone: lookup.status === "notFound" ? "info" : "error",
            title: t(`articles.scanner.${lookup.status}Title`),
            body: t(`articles.scanner.${lookup.status}Body`),
            key: "articles-scan"
          });
          return;
        }
        const { name, photoUrl } = lookup.product;
        // Known without a name (a photo only): the name is typed, as for a product unknown.
        setDraft((current) =>
          name === "" ? nameAwaited(form)(current) : { ...current, name, filled: true }
        );
        if (!photoUrl || keepPhoto) {
          setSearch(null);
          return;
        }
        setSearch({ barcode, name: false, photo: true });
        // A download that throws is a photo not had: the tile never stays greyed (its spinner).
        const photo = await productPhoto(photoUrl, userAgent).catch(() => null);
        if (scan !== scans.current) return;
        setSearch(null);
        if (photo) setDraft((current) => ({ ...current, photo, filled: true }));
      }
    );
  };

  return { search, lookUp, drop };
}

/**
 * "Add an item": a bottom sheet on mobile (photo on the left, name and price on the right, "Scan"
 * in its header in the apps), a centred dialog on desktop: the photo dropped or chosen, then name
 * and price side by side, the description (the form scrolling in a low window), and "Cancel" /"Save
 * the item" at its bottom. The description opens with "Add a description" (an optional field).
 * Name and price are required; the price in the account's display currency, or, for an article
 * changed, in its own. The same panel changes an article ("Edit the item"): its fields filled, its
 * photo shown, and "Delete the item".
 * The point of sale's scan opens it too, for a barcode of no article (src/features/terminal/ScanPad.tsx).
 */
export function ArticleSheet({
  visible,
  draft,
  onDraft,
  editing,
  count,
  languageTag,
  search,
  epoch,
  onReadEpoch,
  onClose,
  onScan,
  onSaved,
  onRemove,
  beforeSave,
  typedIn
}: {
  visible: boolean;
  draft: Draft;
  onDraft: (update: (draft: Draft) => Draft) => void;
  /** The article changed; null for a new one. */
  editing: Article | null;
  count: number;
  languageTag: string;
  /** A scanned barcode Open Food Facts is asked about: what it may still fill waits for it. */
  search: ProductSearch | null;
  /** The catalogue's epoch read as the form opened: "Save" waits for it. */
  epoch: EpochRead;
  /** Reads the epoch again (no majority of the relays told it as the form opened). */
  onReadEpoch: () => Promise<number | null>;
  onClose: () => void;
  /** Opens the scanner; null where there is none (desktop, the web). */
  onScan: (() => void) | null;
  /** `changed`: an article changed, not added. */
  onSaved: (article: Article, changed: boolean) => void;
  /** Asks to confirm the removal of the article changed (only with `editing`). */
  onRemove?: (article: Article) => void;
  /**
   * Run first as "Save" is pressed, the button loading: false saves nothing, quietly (the point of
   * sale in till mode opens the account with the passkey there, the prompt dismissed).
   */
  beforeSave?: () => Promise<boolean>;
  /**
   * The currency a new article's price is typed in and saved with: the account's display currency
   * by default (priceCurrency); the point of sale's in till mode, where no account is open to tell
   * it.
   */
  typedIn?: { currency: string; digits: number };
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [photoFailure, setPhotoFailure] = useState<Failure | null>(null);
  // A photo picked or dropped, being made a square JPEG (pick-image.ts): "Save" waits for it.
  const { preparing, prepare } = usePhotoPreparation(
    (photo) => onDraft((current) => ({ ...current, photo })),
    setPhotoFailure
  );
  const priced = editing ? priceCurrencyOf(editing) : (typedIn ?? priceCurrency());
  const { currency, digits } = priced;
  const priceMinor = draft.price.trim() === "" ? null : parseFiatMinor(draft.price, digits);
  const priceInvalid = draft.price.trim() !== "" && priceMinor === null;
  // What "Save" saves, once the name and the price are there.
  const typed =
    draft.name.trim() !== "" && priceMinor !== null
      ? {
          name: draft.name,
          description: draft.descriptionOpen ? draft.description : "",
          priceMinor,
          photo: draft.photo,
          barcode: draft.barcode
        }
      : null;
  // An article opened is saved only once something changed.
  // Not while Open Food Facts is asked, nor while a photo is prepared: it would be lost.
  const canSave =
    typed !== null &&
    !busy &&
    search === null &&
    !preparing &&
    (editing === null || changesArticle(editing, typed));
  const savedPhoto = useImageUri(editing?.image ?? null);
  const photoUri = draft.photo ? imageUri(draft.photo) : savedPhoto;
  // From the draft as it is then: a photo read while the owner types keeps what was typed.
  const update = (patch: Partial<Draft>) => onDraft((current) => ({ ...current, ...patch }));

  /**
   * Opens the photo library or the camera (the browser's file picker on the web), then prepares the
   * photo it gave (prepare) from the moment it gave it. The picker's own failures are said
   * (codeOf). On the web, the picker reads the image's size before it gives it: "Save" waits from
   * then on, 7 to 22 ms after the file was chosen in Chromium (photos of 40 KB to 4.5 MB); the
   * preparation itself took 0.1 to 1.4 s.
   */
  const takePhoto = (source?: ImageSource) => {
    setPhotoFailure(null);
    pickImageToSquare("article", source).then(
      (picked) => {
        if (picked) prepare(picked.bytes);
      },
      (error: unknown) => setPhotoFailure(codeOf(error))
    );
  };
  // Not while Open Food Facts' photo is awaited (nor the name, below): it would replace it. Nor
  // while one is prepared: one photo at a time.
  const photoDisabled = busy || preparing || (search?.photo ?? false);
  // In the apps, the photo is taken with the system's camera app or picked from the photo library
  // (Android's photo picker offers no camera), from a menu on the photo. The web keeps the
  // browser's file picker, whose own menu offers the camera on a phone.
  const photoAnchor = useRef<ViewInstance>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  /** The source chosen in the menu: opened once the menu is gone (Popover's onClosed). */
  const chosenSource = useRef<ImageSource | null>(null);
  const pickPhoto = () => {
    if (photoDisabled) return;
    if (Platform.OS === "web") {
      takePhoto();
      return;
    }
    // The menu opens under the photo, where the keyboard of the name's field may be.
    Keyboard.dismiss();
    // A choice whose menu never told it closed (unmounted with the Sheet) opens nothing now.
    chosenSource.current = null;
    setPhotoMenu(true);
  };
  const chooseSource = (source: ImageSource) => {
    chosenSource.current = source;
    setPhotoMenu(false);
  };
  const photoMenuClosed = () => {
    const source = chosenSource.current;
    chosenSource.current = null;
    if (source && !photoDisabled) takePhoto(source);
  };

  // "Save" loading until the relays told the epoch: never sealed with a key of before.
  const reading = epoch.status === "reading";
  // The article of a save no majority of the relays took, which some may hold: saved again, the
  // same one, dated after it (addArticle, updateArticle), never a second one.
  const attempt = useRef<Article | null>(null);
  const save = () => {
    if (!canSave || typed === null || epoch.status === "reading") return;
    setBusy(true);
    const ready = beforeSave ? beforeSave() : Promise.resolve(true);
    ready
      .then(async (go) => {
        if (!go) return null;
        // Not told as the form opened (no majority of the relays, or no account open then): read
        // again first, still loading.
        const known = epoch.epoch;
        const sealedAt = known === null ? await onReadEpoch() : known;
        return editing
          ? updateArticle(editing, typed, sealedAt, attempt.current)
          : addArticle(typed, count, sealedAt, { typedIn: priced, attempt: attempt.current });
      })
      .then(
        (article) => {
          setBusy(false);
          if (article) onSaved(article, editing !== null);
        },
        (error: unknown) => {
          setBusy(false);
          if (error instanceof CatalogError && error.attempt && !isRemoval(error.attempt)) {
            attempt.current = error.attempt;
          }
          const code = codeOf(error);
          notify({
            tone: "error",
            title: t(editing ? "articles.errors.changeTitle" : "articles.errors.title"),
            body: t(`articles.errors.${code}`),
            key: "articles"
          });
        }
      );
  };

  const nameField = (
    <TextField
      label={t("articles.form.nameLabel")}
      value={draft.name}
      onChangeText={(name) => update({ name: name.slice(0, ARTICLE_NAME_MAX_LENGTH) })}
      placeholder={t("articles.form.namePlaceholder")}
      autoFocus={draft.focus === "name"}
      autoCapitalize="sentences"
      trailing={search?.name ? <Spinner size={18} testID="article-name-searching" /> : undefined}
      disabled={busy || (search?.name ?? false)}
      testID="article-name"
    />
  );
  const priceField = (
    <TextField
      label={t("articles.form.priceLabel")}
      value={draft.price}
      onChangeText={(value) => update({ price: value })}
      placeholder={fiatPlaceholder(digits, languageTag)}
      monospace
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoFocus={draft.focus === "price"}
      trailing={<Text style={styles.unit}>{currency}</Text>}
      error={priceInvalid ? t("articles.form.priceInvalid") : null}
      disabled={busy}
      style={desktop ? styles.desktopPrice : undefined}
      testID="article-price"
    />
  );
  const description = draft.descriptionOpen ? (
    <TextField
      label={t("articles.form.descriptionLabel")}
      value={draft.description}
      onChangeText={(value) =>
        update({ description: value.slice(0, ARTICLE_DESCRIPTION_MAX_LENGTH) })
      }
      placeholder={t("articles.form.descriptionPlaceholder")}
      multiline={3}
      // Opened by "Add a description": not an article shown with its description, nor a form shown
      // again after a scan (the price).
      autoFocus={draft.focus === "description"}
      disabled={busy}
      testID="article-description"
    />
  ) : (
    <AddAction
      label={t("articles.form.addDescription")}
      onPress={() => update({ descriptionOpen: true, focus: "description" })}
      height={desktop ? 36 : 40}
      testID="article-add-description"
    />
  );
  // While Open Food Facts is asked, the words of what the spinners wait for (they are decorative);
  // once it filled the form, where the name and the photo come from.
  const barcode = search?.barcode ?? draft.barcode;
  const source = search
    ? "articles.form.searching"
    : draft.filled
      ? "articles.form.fromOpenFoodFacts"
      : null;
  const scanned = barcode ? (
    <View style={styles.scanned} testID="article-barcode">
      <Icon name="barcode" size={13} color={colors.text.secondary} />
      <Text style={styles.scannedCode}>{barcode}</Text>
      {source ? <Text style={styles.scannedText}>{t(source)}</Text> : null}
    </View>
  ) : null;
  const photoError = photoFailure ? (
    <ErrorMessage>{t(`articles.errors.${photoFailure}`)}</ErrorMessage>
  ) : null;
  const saveLabel = t(editing ? "articles.form.saveChanges" : "articles.form.save");
  const removeButton =
    editing && onRemove ? (
      <Button
        variant="destructive"
        size={desktop ? "sm" : "md"}
        fullWidth={!desktop}
        icon="trash-can"
        onPress={() => onRemove(editing)}
        disabled={busy}
        style={desktop ? styles.dialogRemove : undefined}
        testID="article-remove"
      >
        {t("articles.form.remove")}
      </Button>
    ) : null;

  return (
    <Sheet
      title={t(editing ? "articles.form.editTitle" : "articles.form.title")}
      closeLabel={t("navigation.close")}
      visible={visible}
      onClose={onClose}
      dismissible={!busy}
      dialogWidth={DIALOG_WIDTH}
      headerAction={
        onScan ? (
          <Button
            variant="text"
            size="sm"
            icon="barcode"
            fullWidth={false}
            onPress={onScan}
            // The form shows again after the scan: a photo prepared meanwhile would come after
            // "Save" could be pressed.
            disabled={busy || preparing}
            testID="article-scan"
          >
            {t("articles.form.scan")}
          </Button>
        ) : null
      }
      testID="article-sheet"
    >
      {desktop ? (
        <>
          <ScrollView
            style={styles.dialogScroll}
            contentContainerStyle={styles.dialogBody}
            keyboardShouldPersistTaps="handled"
          >
            <DropZone
              anchor={photoAnchor}
              photoUri={photoUri}
              preparing={preparing}
              disabled={photoDisabled}
              onPick={pickPhoto}
              onDrop={(bytes) => {
                if (photoDisabled) return;
                setPhotoFailure(null);
                prepare(bytes);
              }}
            />
            {photoError}
            <View style={styles.dialogRow}>
              <View style={styles.dialogName}>{nameField}</View>
              {priceField}
            </View>
            {description}
            {removeButton}
          </ScrollView>
          <View style={styles.dialogFooter}>
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={onClose}
              disabled={busy}
              style={styles.dialogCancel}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              fullWidth={false}
              onPress={save}
              disabled={!canSave}
              loading={busy || reading}
              style={styles.dialogSave}
              testID="article-save"
            >
              {saveLabel}
            </Button>
          </View>
        </>
      ) : (
        <>
          <View style={styles.mobileForm}>
            <PhotoTile
              anchor={photoAnchor}
              photoUri={photoUri}
              searching={search?.photo ?? false}
              preparing={preparing}
              disabled={photoDisabled}
              onPick={pickPhoto}
            />
            <View style={styles.mobileFields}>
              {nameField}
              {priceField}
            </View>
          </View>
          {scanned}
          {photoError}
          {description}
          <Button
            onPress={save}
            disabled={!canSave}
            loading={busy || reading}
            testID="article-save"
          >
            {saveLabel}
          </Button>
          {removeButton}
        </>
      )}
      {/* In the Sheet's Modal: on iOS, a Modal presents over the one it is rendered in. */}
      <Popover
        visible={photoMenu}
        anchor={photoAnchor}
        width={PHOTO_MENU_WIDTH}
        label={t("articles.form.photoMenu")}
        onClose={() => setPhotoMenu(false)}
        onClosed={photoMenuClosed}
        testID="article-photo-menu"
      >
        <PhotoMenuRow
          icon="camera"
          label={t("articles.form.takePhoto")}
          onPress={() => chooseSource("camera")}
          testID="article-photo-camera"
        />
        <PhotoMenuRow
          icon="image"
          label={t("articles.form.pickPhoto")}
          onPress={() => chooseSource("library")}
          testID="article-photo-library"
        />
      </Popover>
    </Sheet>
  );
}

/** A row of the photo's menu, as a column's menu draws them (ColumnHeader). */
function PhotoMenuRow({
  icon,
  label,
  onPress,
  testID
}: {
  icon: "camera" | "image";
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ListRow
      inset={PHOTO_MENU_INSET}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.menuRow}
      testID={testID}
    >
      <Icon name={icon} size={14} color={colors.text.secondary} style={styles.menuIcon} />
      <Text numberOfLines={1} style={styles.menuText}>
        {label}
      </Text>
    </ListRow>
  );
}

/**
 * Mobile: the photo's tile, 128 × 176 on sand, "Add a photo" until one is picked; a spinner while a
 * scanned product's photo is awaited, a spinner and its words while a photo picked is prepared (the
 * tile disabled then).
 */
function PhotoTile({
  anchor,
  photoUri,
  searching,
  preparing,
  disabled,
  onPick
}: {
  /** Where the photo's menu opens. */
  anchor: RefObject<ViewInstance | null>;
  photoUri: string | null;
  searching: boolean;
  /** A photo picked, being prepared: shown in its place, once made. */
  preparing: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      ref={anchor}
      accessibilityRole="button"
      accessibilityLabel={t(
        preparing
          ? "articles.form.preparingPhoto"
          : photoUri
            ? "articles.form.changePhoto"
            : "articles.form.addPhoto"
      )}
      accessibilityState={{ busy: preparing || searching }}
      onPress={onPick}
      disabled={disabled}
      style={styles.tile}
      testID="article-photo"
    >
      {preparing ? (
        <>
          <Spinner size={28} testID="article-photo-preparing" />
          <Text style={styles.tileText}>{t("articles.form.preparingPhoto")}</Text>
        </>
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : searching ? null : (
        <>
          <Icon name="camera" size={20} color={colors.text.accent} />
          <Text style={styles.tileText}>{t("articles.form.addPhoto")}</Text>
        </>
      )}
      {searching ? <Spinner size={28} testID="article-photo-searching" /> : null}
    </Pressable>
  );
}

/**
 * Desktop: the photo's zone, ZONE_HEIGHT high, dashed while empty: a photo dropped on it (the web)
 * or chosen ("or choose a file": the whole zone opens the picker); a spinner and its words while
 * that photo is prepared.
 */
function DropZone({
  anchor,
  photoUri,
  preparing,
  disabled,
  onPick,
  onDrop
}: {
  /** Where the photo's menu opens (the apps on a tablet). */
  anchor: RefObject<ViewInstance | null>;
  photoUri: string | null;
  /** A photo dropped or chosen, being prepared: shown in its place, once made. */
  preparing: boolean;
  disabled: boolean;
  onPick: () => void;
  onDrop: (bytes: Promise<Uint8Array | null>) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const zone = useRef<ViewInstance>(null);
  const { dragging } = usePhotoDrop(zone, onDrop);
  const { hovered, hoverProps } = useHover();
  return (
    <View ref={zone} collapsable={false}>
      <Pressable
        ref={anchor}
        accessibilityRole="button"
        accessibilityLabel={t(
          preparing
            ? "articles.form.preparingPhoto"
            : photoUri
              ? "articles.form.changePhoto"
              : "articles.form.choosePhoto"
        )}
        accessibilityState={{ busy: preparing }}
        onPress={onPick}
        disabled={disabled}
        {...hoverProps}
        style={[
          styles.zone,
          // Preparing: the photo's place, no longer a zone to drop on.
          !photoUri && !preparing && styles.zoneEmpty,
          (dragging || hovered) && !photoUri && !preparing && styles.zoneActive
        ]}
        testID="article-photo"
      >
        {preparing ? (
          <>
            <Spinner size={28} testID="article-photo-preparing" />
            <Text style={styles.zoneTitle}>{t("articles.form.preparingPhoto")}</Text>
          </>
        ) : photoUri ? (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <>
            <Icon name="image" size={24} color={colors.text.tertiary} style={styles.zoneIcon} />
            <Text style={styles.zoneTitle}>{t("articles.form.dropPhoto")}</Text>
            <Text style={styles.zoneLink}>{t("articles.form.choosePhoto")}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  unit: { ...mono(600), fontSize: type.body, color: colors.text.secondary },
  mobileForm: { flexDirection: "row", gap: 14 },
  mobileFields: { flex: 1, minWidth: 0, gap: space[5] },
  tile: {
    width: 128,
    height: 176,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: space[5]
  },
  tileText: {
    ...sans(700),
    fontSize: type.caption,
    lineHeight: type.caption * 1.3,
    textAlign: "center",
    color: colors.text.accent
  },
  scanned: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4 },
  scannedCode: { ...mono(600), fontSize: type.caption, color: colors.text.secondary },
  scannedText: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  // Shrinks with the dialog to its greatest height: the form scrolls, its buttons stay under it.
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogBody: { gap: space[6] },
  // The name takes what the price leaves; both labels on one line, their fields aligned.
  dialogRow: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  dialogName: { flex: 1, minWidth: 0 },
  zone: {
    height: ZONE_HEIGHT,
    paddingHorizontal: space[5],
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  zoneEmpty: {
    borderWidth: stroke.control,
    borderStyle: "dashed",
    borderColor: colors.border.subtle
  },
  zoneActive: { borderColor: colors.border.accent },
  zoneIcon: { marginBottom: 4 },
  zoneTitle: {
    ...sans(600),
    fontSize: type.prose,
    textAlign: "center",
    color: colors.text.primary
  },
  zoneLink: { ...sans(700), fontSize: 13, textAlign: "center", color: colors.text.accent },
  desktopPrice: { width: 220 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    minHeight: controlSize.min
  },
  menuIcon: { width: 16, textAlign: "center" },
  menuText: {
    ...sans(500),
    flex: 1,
    minWidth: 0,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  // "Cancel" and "Save" on the right, wrapping rather than overflowing a long label.
  dialogFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: space[2]
  },
  // These widths at least; wider for a longer label ("Save the changes").
  dialogCancel: { minWidth: 120 },
  dialogSave: { minWidth: 210 },
  // Under the form, away from "Save": the footer holds "Cancel" and "Save the changes" (or its
  // "Saving…"), not a third button.
  dialogRemove: { alignSelf: "flex-start", marginTop: space[2] }
}));
