import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { LINE_NAME_MAX_LENGTH, MAX_INVOICE_LINES, MAX_QUANTITY_UNITS } from "@/config/invoices";
import { majority } from "@/config/registry";
import { getAccountSettings } from "@/features/account/session";
import { codeOf } from "@/features/catalog/ArticleSheet";
import {
  addArticle,
  CatalogError,
  changesArticle,
  type ArticleDraft,
  loadCatalog,
  refreshCatalogEpoch,
  removeArticle,
  updateArticle
} from "@/features/catalog/catalog";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { usePos } from "@/features/terminal/pos";
import { parseFiatMinor } from "@/features/wallet/send/amount";
import { isRemoval, type Article, type CatalogEntry } from "@/lib/catalog/article";
import {
  convertPrice,
  invoiceTotals,
  isPayable,
  lineNetMinor,
  parseQuantity,
  parseVatRate,
  type InvoiceLine
} from "@/lib/invoice/amounts";
import { logFailure } from "@/lib/log/log";
import { sameImageRef } from "@/lib/media/image";
import { fetchRate } from "@/lib/rates/snapshot";
import { formatFiatPlain } from "@/lib/terminal/amount";
import { makeStyles, mono, radius, sans, space, stroke, tracked, type, useTheme } from "@/theme";

import {
  ArticlePicker,
  useCatalogArticles,
  type CatalogState,
  type PickedArticle
} from "./ArticlePicker";
import { lineOf, newLineKey, quantityText, vatText, type LineDraft } from "./form";
import { money, moneyWithCurrency, quantityTimesPrice, vatLabel } from "./format";
import {
  isArticleOf,
  lineArticle,
  SameNameSheet,
  SaveToCatalogLink,
  sameName,
  updatable,
  type LineArticle,
  type SaveState
} from "./SaveToCatalog";
import { useLineSaves, type LineSavesStore, type PendingSave } from "./line-saves";
import { StepTitle } from "./WizardFrame";

type LinesStepProps = {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  currency: { code: string; digits: number };
  /** The rate a new line starts with, in basis points ("Settings", else the country's). */
  defaultVat: number;
  languageTag: string;
  disabled: boolean;
  /** "Save to my items"' store, the wizard's. */
  saves: LineSavesStore;
};

/** Whether every line is whole: its designation, and numbers that are ones. */
export function linesComplete(lines: readonly LineDraft[], digits: number): boolean {
  return lines.every((line) => line.name.trim() !== "" && lineOf(line, digits) !== null);
}

/** Whether the step can be left: whole lines that make a payable invoice. */
export function linesReady(lines: readonly LineDraft[], digits: number): boolean {
  if (!linesComplete(lines, digits)) return false;
  return isPayable(
    lines.map((line) => lineOf(line, digits)!),
    digits
  );
}

/**
 * What a save is about (runSave): the article it changes (null: it adds one), and the articles of
 * the line's name it knew of (a duplicate's: never taken for another device's later).
 */
type SaveTarget = { existing: Article | null; known: readonly string[] };

/** An article's fields as a draft saves them again (its photo kept: null). */
function articleDraft(article: Article): ArticleDraft {
  return {
    name: article.name,
    description: article.description,
    priceMinor: article.price.minor,
    photo: null,
    barcode: article.barcode
  };
}

/** Whether two copies of an article are the same version of it. */
function sameVersion(a: Article, b: Article): boolean {
  return (
    a.updatedAt === b.updatedAt &&
    a.price.currency === b.price.currency &&
    sameImageRef(a.image, b.image) &&
    !changesArticle(a, articleDraft(b))
  );
}

/**
 * The articles as proven, the lines' failed saves aside (a minority of the relays may hold them):
 * a failed add is not listed (its line takes its id again, or removes it); the article a failed
 * update changed is listed as it was before. Changed since by another device, an article is
 * listed as read.
 */
function provenCatalog(
  articles: readonly Article[],
  pending: ReadonlyMap<string, PendingSave>
): Article[] {
  const saves = [...pending.values()];
  return articles.flatMap((article) => {
    // The failed save (of whichever line) this copy is a version of; none: as read.
    const save = saves.find(
      ({ attempt, versions }) =>
        attempt.id === article.id && versions.some((version) => sameVersion(article, version))
    );
    if (!save) return [article];
    return save.existing ? [save.existing] : [];
  });
}

/**
 * Step 2, "What are you invoicing?". Mobile: on 390 px a line does not fit flat; folded, it shows
 * what is read again (designation, quantity, amount), unfolded its four fields, the VAT rate
 * included (pre-filled from "Settings", free line by line, without a sentence saying so); the line
 * being changed is the screen's only white card. Desktop: one row per line in the columns of the
 * table, the line being changed as fields in the same columns. Below: the totals, rate by rate.
 * "Add an item" picks one of the catalogue or a line to type (ArticlePicker);
 * the catalogue is read as soon as the step shows. An article picked again while its line is as it
 * came (same designation, price and rate) adds one to that line's quantity. A line typed by hand,
 * whole, offers "Save to my items" under its fields (SaveToCatalog).
 */
export function LinesStep({
  lines,
  onChange,
  currency,
  defaultVat,
  languageTag,
  disabled,
  saves: lineSaves
}: LinesStepProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [expanded, setExpanded] = useState<string | null>(() =>
    lines.length > 0 && !lineOf(lines[lines.length - 1]!, currency.digits)
      ? lines[lines.length - 1]!.key
      : null
  );
  const [picking, setPicking] = useState(false);
  const { catalog, retry, remember: listEntry, show: showCatalog } = useCatalogArticles();
  const { noteCatalogEntry } = usePos();
  /** An article published, or its removal: listed here and at the point of sale at once. */
  const remember = (entry: CatalogEntry) => {
    listEntry(entry);
    noteCatalogEntry(entry);
  };
  const [converting, setConverting] = useState(false);
  // "Save to my items": kept beyond the step (line-saves.ts).
  const saves = useLineSaves(lineSaves);
  const saving = saves.running;
  // The step's read as proven (provenCatalog): what the link and "Add an item" go by.
  const listedCatalog: CatalogState =
    catalog.status === "ready" && saves.pending.size > 0
      ? { status: "ready", articles: provenCatalog(catalog.articles, saves.pending) }
      : catalog;
  const { digits } = currency;

  const update = (key: string, patch: Partial<LineDraft>) =>
    onChange(
      lines.map((line) => {
        if (line.key !== key) return line;
        // Its name or price changed: a line typed by hand from then on.
        const typed =
          (patch.name !== undefined && patch.name !== line.name) ||
          (patch.price !== undefined && patch.price !== line.price);
        return typed ? { ...line, ...patch, article: undefined } : { ...line, ...patch };
      })
    );
  const remove = (key: string) => {
    onChange(lines.filter((line) => line.key !== key));
    if (expanded === key) setExpanded(null);
    if (lineSaves.current().pending.get(key)?.existing === null) void removeOwnAdd(key);
    else lineSaves.forget(key);
  };
  /**
   * A removed line's failed add removed too, on the catalogue read again (another device's hand on
   * it since: left to it, withPending), as far as the relays take it (giveUpOwnAdd). A failure only
   * goes to the journal: the line is gone, nothing retries, and the article is no longer kept out
   * of sight.
   */
  const removeOwnAdd = async (key: string) => {
    if (!lineSaves.start(key)) return;
    try {
      withPending(key, await readCatalog());
      await giveUpOwnAdd(key);
    } catch (error) {
      logFailure("Removing a removed invoice line's failed article failed", error);
    } finally {
      lineSaves.forget(key);
      lineSaves.finish();
    }
  };
  const append = (line: Omit<LineDraft, "key">, open: boolean) => {
    const key = newLineKey();
    onChange([...lines, { key, ...line }]);
    setExpanded(open ? key : null);
  };

  /**
   * The link of a line (null: none): a line typed by hand, whole, once the catalogue is read (or
   * its read failed), and not in it already, unless this line saved it as the catalogue lists it
   * now ("Saved to my items") or its save failed.
   */
  const saveStateOf = (line: LineDraft): SaveState | null => {
    if (line.article !== undefined) return null;
    if (saving === line.key) return "saving";
    const typed = lineArticle(line, currency);
    if (!typed) return null;
    // Its last save published on too few relays: offered again, whatever a read lists (a press
    // saves it again, or ends the line elsewhere and removes it: onSave).
    if (saves.pending.has(line.key)) return "idle";
    // Unreadable: a press reads it again (onSave), and says what it finds.
    if (listedCatalog.status !== "ready") return listedCatalog.status === "failed" ? "idle" : null;
    const { articles } = listedCatalog;
    const mine = saves.saved.get(line.key);
    const listed = mine && articles.find(({ id }) => id === mine.id);
    if (listed && isArticleOf(listed, typed, currency)) return "saved";
    return articles.some((article) => isArticleOf(article, typed, currency)) ? null : "idle";
  };

  /**
   * Runs one save at a time (lineSaves), the link of `key` saving meanwhile; `target.existing` is
   * the article it changes (null: it adds one), set by publish. A failure after publishing keeps
   * its `attempt` for the line's next save (onSave); a failure is said as "Items" says it
   * (ArticleSheet), the same message replacing the last one.
   */
  const runSave = async (key: string, run: (target: SaveTarget) => Promise<void>) => {
    if (!lineSaves.start(key)) return;
    const target: SaveTarget = { existing: null, known: [] };
    try {
      await run(target);
    } catch (error) {
      if (error instanceof CatalogError) {
        // The relays' failure, for support; the others are the merchant's to see (as ArticleSheet).
        if (error.code === "unreachable") {
          logFailure("Saving an invoice line as an article failed", error);
        }
        if (error.attempt && !isRemoval(error.attempt)) {
          const attempt = error.attempt;
          const before = lineSaves.current().pending.get(key);
          const versions =
            before?.attempt.id === attempt.id ? [...before.versions, attempt] : [attempt];
          lineSaves.setPending(key, {
            attempt,
            existing: target.existing,
            versions,
            known: target.known
          });
        }
      }
      notify({
        tone: "error",
        title: t(target.existing ? "articles.errors.changeTitle" : "articles.errors.title"),
        body: t(`articles.errors.${codeOf(error)}`),
        key: "articles"
      });
    } finally {
      lineSaves.finish();
    }
  };

  /**
   * The catalogue read again for a save, on a majority of the relays (an article of the same name
   * must not be missed). Rejects with a CatalogError "unreachable" without a majority. Articles of
   * a newer app, unreadable here, do not stop a save, as in "Items" (ArticlesScreen).
   */
  const readCatalog = async () => {
    // The relays loadCatalog asks (openCatalog's), counted as it starts.
    const relays = getAccountSettings()?.relays.length ?? 0;
    const read = await loadCatalog();
    if (relays === 0 || read.answered < majority(relays)) {
      throw new CatalogError("unreachable", "No majority of the relays answered");
    }
    return read.articles;
  };

  /**
   * After a read: an article just like the line (added elsewhere meanwhile) is the line's; an
   * article of the same name is shown (SameNameSheet: of several, the newest one the line's price
   * can update, else the newest, a read listing the newest first); else the line is added.
   */
  const settle = async (
    key: string,
    typed: LineArticle,
    articles: readonly Article[],
    target: SaveTarget
  ) => {
    const same = articles.find((article) => isArticleOf(article, typed, currency));
    if (same) {
      await giveUpOwnAdd(key);
      lineSaves.setSaved(key, same);
      return;
    }
    const sameNamed = articles.filter((article) => sameName(article.name, typed.name));
    const named = sameNamed.find((article) => updatable(article, currency)) ?? sameNamed[0];
    if (named) lineSaves.setConflict({ key, article: named, typed });
    else await publish(key, typed, null, articles.length, target);
  };

  /**
   * "Save to my items": the catalogue read again, then settle. After a save that failed after
   * publishing, the line still as it was saved, that same save is done again, dated after it (its
   * `attempt`: the article a minority of the relays may hold is replaced, never listed twice), as
   * "Items" saves a form again (ArticleSheet), unless an article of its name it did not know of is
   * listed (settle looks first). Changed since, a failed add is kept out of sight: the line's next
   * new article takes its id, or it is removed when the line ends on another article (publish,
   * settle). A failed update the line no longer asks for, or a failed save another device's hand
   * shows on (withPending), is left, as a form closed after a failure.
   */
  const onSave = (line: LineDraft) => {
    const typed = lineArticle(line, currency);
    if (!typed) return;
    const { key } = line;
    void runSave(key, async (target) => {
      target.existing = lineSaves.current().pending.get(key)?.existing ?? null;
      const { raw, articles, pending } = withPending(key, await readCatalog());
      const unchanged = pending !== undefined && isArticleOf(pending.attempt, typed, currency);
      // An article of its name it did not know of (another line's too): looked at first (settle).
      const asks = articles.some(
        ({ id, name }) => sameName(name, typed.name) && !pending?.known.includes(id)
      );
      if (pending && unchanged && !asks) {
        target.known = pending.known;
        await publish(key, typed, pending.existing, articles.length, target);
        return;
      }
      target.existing = null;
      // A failed add kept out of sight: the line's next article takes its place (publish). A
      // failed update kept while the line is as it saved it: chosen again, it is published again.
      // Given up, the article is looked at as the relays hold it (its failed change may be the
      // newest there).
      if (pending?.existing && !unchanged) {
        lineSaves.dropPending(key);
        await settle(key, typed, provenCatalog(raw, lineSaves.current().pending), target);
        return;
      }
      await settle(key, typed, articles, target);
    });
  };

  /** A folded line opened; never while a line saves (its answer shows in its card). */
  const openLine = (key: string) => {
    if (saving === null) setExpanded(key);
  };

  /**
   * The line's failed save as a read shows it: left (dropped) when another device's hand shows on
   * it since (its article as neither this line published it nor as it was before, whatever the
   * clocks; the article updated gone). An article of its name added since is onSave's to ask about
   * (settle), not a reason to leave it. `articles`: the read as proven (provenCatalog), shown in
   * "Add an item"; `raw`: as the relays gave it.
   */
  const withPending = (key: string, raw: readonly Article[]) => {
    const pending = lineSaves.current().pending.get(key);
    if (pending) {
      const { attempt, existing } = pending;
      const held = raw.find(({ id }) => id === attempt.id);
      // The versions this wizard published of it: the line's own for an article it added, any
      // line's for an article several may update.
      const versions =
        existing === null
          ? pending.versions
          : [...lineSaves.current().pending.values()]
              .filter((save) => save.attempt.id === attempt.id)
              .flatMap((save) => save.versions);
      const elsewhere =
        (held !== undefined &&
          !versions.some((version) => sameVersion(held, version)) &&
          !(existing !== null && sameVersion(held, existing))) ||
        (existing !== null && held === undefined);
      if (elsewhere) lineSaves.dropPending(key);
    }
    // Kept as read: listedCatalog shows it as proven, as the failed saves are at each moment.
    showCatalog([...raw]);
    const articles = provenCatalog(raw, lineSaves.current().pending);
    return { raw, articles, pending: lineSaves.current().pending.get(key) };
  };

  /**
   * SameNameSheet's choice, on the catalogue read again (the sheet may have stayed open while it
   * changed elsewhere): a new article; or the article shown, as it is now, given the line's price.
   * One just like the line added meanwhile, or the article shown gone, renamed or of another
   * currency since, the line is looked at anew (settle).
   */
  const onChoose = (update: boolean) => {
    const { conflict, running } = lineSaves.current();
    // The read that showed it still ending: the sheet stays, pressed again once it has.
    if (!conflict || running !== null) return;
    lineSaves.setConflict(null);
    const { key, typed, article } = conflict;
    void runSave(key, async (target) => {
      if (update) target.existing = article;
      const { articles } = withPending(key, await readCatalog());
      const now = articles.find(({ id }) => id === article.id);
      const same = articles.some((listed) => isArticleOf(listed, typed, currency));
      const gone = !now || !sameName(now.name, typed.name) || !updatable(now, currency);
      if (same || (update && gone)) {
        target.existing = null;
        await settle(key, typed, articles, target);
        return;
      }
      target.known = articles.filter(({ name }) => sameName(name, typed.name)).map(({ id }) => id);
      await publish(key, typed, update ? now! : null, articles.length, target);
    });
  };

  /**
   * Publishes the article, `count` articles listed: `existing` (of the invoice's currency:
   * SameNameSheet) with the line's price, its name and the rest kept; else a new one of the line's
   * name and price. The line's failed save of that same article is published again (its
   * `attempt`), dated after it.
   */
  const publish = async (
    key: string,
    typed: LineArticle,
    existing: Article | null,
    count: number,
    target: SaveTarget
  ) => {
    target.existing = existing;
    const pending = lineSaves.current().pending.get(key);
    const attempt =
      pending && (pending.existing?.id ?? null) === (existing?.id ?? null) ? pending.attempt : null;
    // Ending on another article than its failed add: that one removed first.
    if (!attempt) await giveUpOwnAdd(key);
    const epoch = await refreshCatalogEpoch();
    const article = existing
      ? await updateArticle(
          existing,
          { ...articleDraft(existing), priceMinor: typed.priceMinor },
          epoch,
          attempt
        )
      : await addArticle(
          {
            name: typed.name,
            description: "",
            priceMinor: typed.priceMinor,
            photo: null,
            barcode: null
          },
          count,
          epoch,
          { typedIn: { currency: currency.code }, attempt }
        );
    remember(article);
    lineSaves.setSaved(key, article);
  };

  /**
   * The line ending on another article than its failed add (kept: onSave), that article is removed
   * first: it would be listed beside the one the line ends with. Rejects as removeArticle (the
   * failed add kept, the line's next press tries again). A failed update is only forgotten (as
   * ArticleSheet leaves it).
   */
  const giveUpOwnAdd = async (key: string) => {
    const pending = lineSaves.current().pending.get(key);
    if (!pending || pending.existing !== null) return;
    remember(await removeArticle(pending.attempt));
    lineSaves.dropPending(key);
  };

  const onPick = async (picked: PickedArticle) => {
    setPicking(false);
    const vat = vatText(defaultVat, languageTag);
    if (picked.kind === "manual") {
      append({ name: "", quantity: "1", price: "", vat }, true);
      return;
    }
    const { article } = picked;
    let unitMinor = article.price.minor;
    if (article.price.currency !== currency.code || article.price.digits !== digits) {
      setConverting(true);
      try {
        unitMinor = await convertedPrice(article.price, currency);
      } catch (error) {
        logFailure("Converting an article's price failed", error);
        notify({ tone: "error", title: t("invoices.picker.convertFailed") });
        return;
      } finally {
        setConverting(false);
      }
    }
    const name = article.name.slice(0, LINE_NAME_MAX_LENGTH);
    // The same article again, its line untouched (name, price, rate): one more on that line.
    const same = lines.find((line) => {
      const value = lineOf(line, digits);
      return (
        value !== null &&
        value.name === name &&
        value.unitMinor === unitMinor &&
        value.vatRate === defaultVat &&
        value.quantity + 100 <= MAX_QUANTITY_UNITS * 100 + 99
      );
    });
    if (same) {
      const quantity = lineOf(same, digits)!.quantity + 100;
      update(same.key, { quantity: quantityText(quantity, languageTag) });
      return;
    }
    append(
      {
        name,
        quantity: "1",
        price: formatFiatPlain(unitMinor, digits, languageTag),
        vat,
        article: article.id
      },
      false
    );
  };

  const read = lines.flatMap((line) => {
    const value = lineOf(line, digits);
    return value ? [value] : [];
  });
  const totals = invoiceTotals(read);
  const full = lines.length >= MAX_INVOICE_LINES;
  const tooLarge =
    linesComplete(lines, digits) &&
    read.length > 0 &&
    !isPayable(read, digits) &&
    totals.totalMinor > 0;

  return (
    <View>
      <StepTitle>{t("invoices.lines.title")}</StepTitle>
      {lines.length === 0 ? (
        // The empty list says what goes in it and holds the way to add it, so no button stands
        // apart below a card that looks pressable but is not.
        <View style={styles.empty} testID="invoice-lines-empty">
          <Icon name="receipt" size={24} color={colors.text.secondary} />
          <Text style={styles.emptyText}>{t("invoices.lines.empty")}</Text>
          <Text style={styles.emptyLead}>{t("invoices.lines.emptyLead")}</Text>
          <View style={styles.emptyAction}>
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              fullWidth={false}
              onPress={() => setPicking(true)}
              testID="invoice-add-line"
            >
              {t("invoices.lines.add")}
            </Button>
          </View>
        </View>
      ) : desktop ? (
        <View style={styles.table}>
          <View style={[styles.grid, styles.columns]}>
            <Text style={[styles.columnLabel, styles.nameCell]}>{t("invoices.lines.name")}</Text>
            <Text style={[styles.columnLabel, styles.qtyCell, styles.right, styles.fieldPad]}>
              {t("invoices.lines.quantityShort")}
            </Text>
            <Text style={[styles.columnLabel, styles.priceCell, styles.right, styles.fieldPad]}>
              {t("invoices.lines.unitPriceShort")}
            </Text>
            <Text style={[styles.columnLabel, styles.vatCell, styles.right, styles.fieldPad]}>
              {t("invoices.lines.vat")}
            </Text>
            <Text style={[styles.columnLabel, styles.amountCell, styles.right]}>
              {t("invoices.lines.amount")}
            </Text>
            <View style={styles.actionCell} />
          </View>
          <View style={styles.rows}>
            {lines.map((line) =>
              line.key === expanded ? (
                <DesktopEditor
                  key={line.key}
                  line={line}
                  digits={digits}
                  languageTag={languageTag}
                  // A save running, or an article being added (it folds the open line): the line
                  // stays as it is.
                  disabled={disabled || saving !== null || converting}
                  onChange={(patch) => update(line.key, patch)}
                  onRemove={() => remove(line.key)}
                  saveState={saveStateOf(line)}
                  onSave={() => onSave(line)}
                />
              ) : (
                <DesktopRow
                  key={line.key}
                  line={line}
                  digits={digits}
                  languageTag={languageTag}
                  onPress={() => openLine(line.key)}
                  disabled={saving !== null}
                />
              )
            )}
          </View>
        </View>
      ) : (
        <View style={styles.rows}>
          {lines.map((line) =>
            line.key === expanded ? (
              <MobileEditor
                key={line.key}
                line={line}
                digits={digits}
                currency={currency}
                languageTag={languageTag}
                disabled={disabled || saving !== null || converting}
                onChange={(patch) => update(line.key, patch)}
                onRemove={() => remove(line.key)}
                saveState={saveStateOf(line)}
                onSave={() => onSave(line)}
              />
            ) : (
              <MobileRow
                key={line.key}
                line={line}
                digits={digits}
                languageTag={languageTag}
                onPress={() => openLine(line.key)}
                disabled={saving !== null}
              />
            )
          )}
        </View>
      )}
      {full || lines.length === 0 ? null : (
        <View style={styles.add}>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            fullWidth={false}
            onPress={() => setPicking(true)}
            // A line saving: its answer (SameNameSheet) must not open under the picker.
            disabled={saving !== null}
            testID="invoice-add-line"
          >
            {t("invoices.lines.add")}
          </Button>
        </View>
      )}
      {converting ? (
        <View style={styles.converting}>
          <Spinner size={16} />
        </View>
      ) : null}
      {read.length > 0 ? (
        <Totals
          lines={read}
          currency={currency}
          languageTag={languageTag}
          desktop={desktop}
          testID="invoice-totals"
        />
      ) : null}
      {tooLarge ? <Text style={styles.error}>{t("invoices.lines.tooLarge")}</Text> : null}
      <ArticlePicker
        visible={picking}
        catalog={listedCatalog}
        onRetry={retry}
        onPick={(picked) => void onPick(picked)}
        onClose={() => setPicking(false)}
        languageTag={languageTag}
      />
      <SameNameSheet
        conflict={saves.conflict}
        currency={currency}
        languageTag={languageTag}
        onClose={() => lineSaves.setConflict(null)}
        onDuplicate={() => onChoose(false)}
        onUpdate={() => onChoose(true)}
      />
    </View>
  );
}

/**
 * An article's price in the invoice's currency: both currencies' points of the present hour
 * (src/lib/rates/), then convertPrice (rounded up to the next minor unit). Rejects when a point is
 * not known, or the two are not of the same hour.
 */
async function convertedPrice(
  price: { minor: number; digits: number; currency: string },
  to: { code: string; digits: number }
): Promise<number> {
  const [source, target] = await Promise.all([fetchRate(price.currency), fetchRate(to.code)]);
  if (!source || !target || source.hour !== target.hour) throw new Error("No common point");
  return convertPrice(
    { minor: price.minor, digits: price.digits, rate: source.rate },
    { digits: to.digits, rate: target.rate }
  );
}

/** The line's errors, for its fields: what is typed but is not a number of its kind. */
function errorsOf(line: LineDraft, digits: number) {
  return {
    quantity: line.quantity !== "" && parseQuantity(line.quantity) === null,
    price: line.price !== "" && parseFiatMinor(line.price, digits) === null,
    vat: line.vat !== "" && parseVatRate(line.vat) === null
  };
}

function MobileRow({
  line,
  digits,
  languageTag,
  onPress,
  disabled
}: {
  line: LineDraft;
  digits: number;
  languageTag: string;
  onPress: () => void;
  /** A line saving: the others stay folded. */
  disabled: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const read = lineOf(line, digits);
  const whole = read !== null && line.name.trim() !== "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("invoices.lines.expand")}
      onPress={onPress}
      disabled={disabled}
      style={styles.mobileRow}
      testID={`invoice-line-${line.key}`}
    >
      <View style={styles.rowTexts}>
        <Text style={styles.rowName} numberOfLines={1}>
          {line.name.trim() || "—"}
        </Text>
        <Text style={[styles.rowMeta, !whole && styles.rowMetaMissing]} numberOfLines={1}>
          {read
            ? t("invoices.lines.summary", {
                quantity: quantityTimesPrice(read, digits, languageTag),
                rate: vatLabel(read.vatRate, languageTag)
              })
            : t("invoices.lines.incomplete")}
        </Text>
      </View>
      <Text style={styles.rowAmount}>
        {read ? money(lineNetMinor(read), digits, languageTag) : ""}
      </Text>
      <Icon name="chevron-down" size={11} color={colors.text.secondary} />
    </Pressable>
  );
}

function MobileEditor({
  line,
  digits,
  currency,
  languageTag,
  disabled,
  onChange,
  onRemove,
  saveState,
  onSave
}: {
  line: LineDraft;
  digits: number;
  currency: { code: string; digits: number };
  languageTag: string;
  disabled: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
  saveState: SaveState | null;
  onSave: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const read = lineOf(line, digits);
  const errors = errorsOf(line, digits);
  return (
    <View style={styles.editor} testID={`invoice-line-editor-${line.key}`}>
      <TextField
        label={t("invoices.lines.name")}
        value={line.name}
        onChangeText={(name) => onChange({ name: name.slice(0, LINE_NAME_MAX_LENGTH) })}
        autoFocus={line.name === ""}
        disabled={disabled}
        testID="invoice-line-name"
      />
      <View style={styles.editorRow}>
        <TextField
          label={t("invoices.lines.quantity")}
          value={line.quantity}
          onChangeText={(quantity) => onChange({ quantity })}
          keyboardType="decimal-pad"
          monospace
          error={errors.quantity ? t("invoices.lines.quantityInvalid") : null}
          disabled={disabled}
          style={styles.quantity}
          testID="invoice-line-quantity"
        />
        <TextField
          label={t("invoices.lines.unitPrice")}
          value={line.price}
          onChangeText={(price) => onChange({ price })}
          keyboardType="decimal-pad"
          monospace
          trailing={<Text style={styles.unit}>{currency.code}</Text>}
          error={errors.price ? t("invoices.lines.priceInvalid") : null}
          disabled={disabled}
          style={styles.flex}
          testID="invoice-line-price"
        />
      </View>
      <TextField
        label={t("invoices.lines.vatRate")}
        value={line.vat}
        onChangeText={(vat) => onChange({ vat })}
        keyboardType="decimal-pad"
        monospace
        trailing={<Text style={styles.unit}>%</Text>}
        error={errors.vat ? t("invoices.lines.vatInvalid") : null}
        disabled={disabled}
        testID="invoice-line-vat"
      />
      {saveState ? (
        <SaveToCatalogLink state={saveState} disabled={disabled} onPress={onSave} />
      ) : null}
      <View style={styles.editorFoot}>
        <Pressable
          accessibilityRole="button"
          onPress={onRemove}
          disabled={disabled}
          style={styles.remove}
          testID="invoice-line-remove"
        >
          <Icon name="trash-can" size={12} color={colors.danger.fg} />
          <Text style={styles.removeText}>{t("invoices.lines.remove")}</Text>
        </Pressable>
        <Text style={styles.editorAmount}>
          {read ? moneyWithCurrency(lineNetMinor(read), currency, languageTag) : ""}
        </Text>
      </View>
    </View>
  );
}

function DesktopRow({
  line,
  digits,
  languageTag,
  onPress,
  disabled
}: {
  line: LineDraft;
  digits: number;
  languageTag: string;
  onPress: () => void;
  /** A line saving: the others stay folded. */
  disabled: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const read = lineOf(line, digits);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("invoices.lines.expand")}
      onPress={onPress}
      disabled={disabled}
      style={[styles.grid, styles.desktopRow]}
      testID={`invoice-line-${line.key}`}
    >
      <Text style={[styles.cellName, styles.nameCell]} numberOfLines={1}>
        {line.name.trim() || "—"}
      </Text>
      <Text style={[styles.cellFigure, styles.qtyCell, styles.right, styles.fieldPad]}>
        {line.quantity}
      </Text>
      <Text style={[styles.cellFigure, styles.priceCell, styles.right, styles.fieldPad]}>
        {line.price}
      </Text>
      <Text
        style={[styles.cellFigure, styles.cellMuted, styles.vatCell, styles.right, styles.fieldPad]}
      >
        {read ? vatLabel(read.vatRate, languageTag) : line.vat}
      </Text>
      <Text style={[styles.cellAmount, styles.amountCell, styles.right]}>
        {read ? money(lineNetMinor(read), digits, languageTag) : t("invoices.lines.incomplete")}
      </Text>
      <View style={[styles.actionCell, styles.chevron]}>
        <Icon name="chevron-down" size={11} color={colors.text.secondary} />
      </View>
    </Pressable>
  );
}

function DesktopEditor({
  line,
  digits,
  languageTag,
  disabled,
  onChange,
  onRemove,
  saveState,
  onSave
}: {
  line: LineDraft;
  digits: number;
  languageTag: string;
  disabled: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
  saveState: SaveState | null;
  onSave: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const read = lineOf(line, digits);
  const errors = errorsOf(line, digits);
  return (
    <View style={styles.desktopEditor} testID={`invoice-line-editor-${line.key}`}>
      <View style={[styles.grid, styles.editorGrid]}>
        <TextField
          value={line.name}
          placeholder={t("invoices.lines.name")}
          onChangeText={(name) => onChange({ name: name.slice(0, LINE_NAME_MAX_LENGTH) })}
          autoFocus={line.name === ""}
          disabled={disabled}
          style={styles.nameCell}
          testID="invoice-line-name"
        />
        <TextField
          value={line.quantity}
          placeholder={t("invoices.lines.quantityShort")}
          onChangeText={(quantity) => onChange({ quantity })}
          align="right"
          error={errors.quantity ? " " : null}
          disabled={disabled}
          style={styles.qtyCell}
          testID="invoice-line-quantity"
        />
        <TextField
          value={line.price}
          placeholder={t("invoices.lines.unitPriceShort")}
          onChangeText={(price) => onChange({ price })}
          align="right"
          error={errors.price ? " " : null}
          disabled={disabled}
          style={styles.priceCell}
          testID="invoice-line-price"
        />
        <TextField
          value={line.vat}
          onChangeText={(vat) => onChange({ vat })}
          align="right"
          trailing={<Text style={styles.unit}>%</Text>}
          error={errors.vat ? " " : null}
          disabled={disabled}
          style={styles.vatCell}
          testID="invoice-line-vat"
        />
        <Text style={[styles.editorAmountDesktop, styles.amountCell]}>
          {read ? money(lineNetMinor(read), digits, languageTag) : ""}
        </Text>
        <View style={styles.actionCell}>
          <IconButton
            icon="trash-can"
            label={t("invoices.lines.removeLine")}
            color={colors.danger.fg}
            onPress={onRemove}
            disabled={disabled}
            testID="invoice-line-remove"
          />
        </View>
      </View>
      {errors.quantity || errors.price || errors.vat ? (
        <Text style={styles.error}>
          {t(
            errors.quantity
              ? "invoices.lines.quantityInvalid"
              : errors.price
                ? "invoices.lines.priceInvalid"
                : "invoices.lines.vatInvalid"
          )}
        </Text>
      ) : null}
      {saveState ? (
        <SaveToCatalogLink state={saveState} disabled={disabled} onPress={onSave} />
      ) : null}
    </View>
  );
}

/**
 * Before VAT, the VAT of each rate on its lines ("VAT 2.6 % on 264.00"), then the total: a sand
 * block on mobile, rows on the cream on desktop.
 */
export function Totals({
  lines,
  currency,
  languageTag,
  desktop,
  card = false,
  testID
}: {
  lines: readonly InvoiceLine[];
  currency: { code: string; digits: number };
  languageTag: string;
  desktop: boolean;
  /** In a white card (the review): no sand block of its own. */
  card?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const totals = invoiceTotals(lines);
  const { digits } = currency;
  const rows = [
    { label: t("invoices.lines.net"), value: money(totals.netMinor, digits, languageTag) },
    ...totals.vat.map((group) => ({
      label: t("invoices.lines.vatOn", {
        rate: vatLabel(group.rate, languageTag),
        base: money(group.baseMinor, digits, languageTag)
      }),
      value: money(group.vatMinor, digits, languageTag)
    }))
  ];
  const big = desktop && !card;
  return (
    <View style={[styles.totals, !desktop && !card && styles.totalsMobile]} testID={testID}>
      {rows.map((row) => (
        <View key={row.label} style={styles.totalRow}>
          <Text style={[styles.totalLabel, desktop && styles.totalLabelDesktop]}>{row.label}</Text>
          <Text style={[styles.totalValue, desktop && styles.totalLabelDesktop]}>{row.value}</Text>
        </View>
      ))}
      <View style={styles.totalLine}>
        <Text style={[styles.total, big && styles.totalDesktop]}>{t("invoices.lines.total")}</Text>
        <Text
          style={[styles.totalFigure, big && styles.totalDesktop]}
          testID={testID && `${testID}-total`}
        >
          {moneyWithCurrency(totals.totalMinor, currency, languageTag)}
        </Text>
      </View>
    </View>
  );
}

// Desktop table: its columns (minmax(0, 1fr) 92px 132px 112px 120px 44px, gap 14).
const COLUMN_GAP = 14;

const useStyles = makeStyles(({ colors }) => ({
  empty: {
    marginTop: 18,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.text.tertiary,
    paddingVertical: 30,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8
  },
  emptyText: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary,
    textAlign: "center"
  },
  emptyLead: {
    ...sans(400),
    fontSize: type.prose,
    color: colors.text.secondary,
    textAlign: "center",
    maxWidth: 420
  },
  emptyAction: { marginTop: space[3] },
  rows: { gap: 8, marginTop: 18 },
  mobileRow: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  rowTexts: { flex: 1, minWidth: 0, gap: 3 },
  rowName: {
    ...sans(600),
    fontSize: 14.5,
    color: colors.text.primary
  },
  rowMeta: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  rowMetaMissing: { color: colors.danger.fg },
  rowAmount: { ...mono(700), fontSize: 14.5, color: colors.text.primary },
  editor: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12
  },
  editorRow: { flexDirection: "row", gap: 10 },
  quantity: { width: 100 },
  flex: { flex: 1 },
  unit: { ...sans(500), fontSize: type.body, color: colors.text.secondary, paddingRight: 4 },
  editorFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border.subtle
  },
  remove: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  removeText: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.danger.fg
  },
  editorAmount: { ...mono(700), fontSize: type.body, color: colors.text.primary },
  add: { marginTop: space[5] },
  converting: { alignItems: "flex-start", paddingVertical: space[3] },
  table: { marginTop: 26 },
  grid: { flexDirection: "row", alignItems: "center", gap: COLUMN_GAP },
  columns: { paddingHorizontal: 16, paddingBottom: 10, marginBottom: -8 },
  columnLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  nameCell: { flex: 1, minWidth: 0 },
  qtyCell: { width: 92 },
  priceCell: { width: 132 },
  vatCell: { width: 112 },
  amountCell: { width: 120 },
  actionCell: { width: 44, alignItems: "center" },
  right: { textAlign: "right" },
  // A value under a field's: as far from the edge as the field's text (19,5 px).
  fieldPad: { paddingRight: 19.5 },
  desktopRow: {
    height: 60,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.background.subtle
  },
  cellName: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  cellFigure: {
    ...sans(700),
    fontSize: type.body,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  cellMuted: { color: colors.text.secondary },
  cellAmount: { ...mono(700), fontSize: 14.5, color: colors.text.primary },
  chevron: { alignItems: "flex-end" },
  desktopEditor: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 8
  },
  // The fields have no label: their 56 px frames, the amount and the trash share one centre line.
  editorGrid: { alignItems: "center" },
  // Plus Jakarta like the row it opens (cellFigure), not the mono of the totals.
  editorAmountDesktop: {
    ...sans(700),
    fontSize: type.body,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary,
    textAlign: "right",
    lineHeight: 56
  },
  error: { ...sans(500), fontSize: type.caption, color: colors.danger.fg, marginTop: space[3] },
  totals: { marginTop: 16, gap: 6 },
  totalsMobile: {
    backgroundColor: colors.background.subtle,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 0
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3
  },
  totalLabel: {
    ...sans(500),
    fontSize: type.caption,
    color: colors.text.secondary,
    flexShrink: 1
  },
  totalLabelDesktop: { fontSize: type.label, letterSpacing: tracked.label },
  totalValue: { ...mono(500), fontSize: type.caption, color: colors.text.secondary },
  totalLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border.subtle
  },
  total: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  },
  totalFigure: { ...mono(700), fontSize: type.body, color: colors.text.primary },
  totalDesktop: { fontSize: 17 }
}));
