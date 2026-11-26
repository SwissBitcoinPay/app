import {
  ARTICLE_DESCRIPTION_MAX_LENGTH,
  ARTICLE_NAME_MAX_LENGTH,
  MAX_ARTICLES
} from "@/config/catalog";
import { majority } from "@/config/registry";
import { getAccountSettings, getAccountTeamKeys } from "@/features/account/session";
import { rememberImage } from "@/features/media/images";
import { catalogEpochOf, knownRoster, readRoster } from "@/features/team/roster";
import { inBatches } from "@/lib/batches";
import {
  articleAddress,
  articleEvent,
  articlesOf,
  catalogEntriesOf,
  catalogFilter,
  fetchArticles,
  newArticleId,
  publishArticle,
  type Article,
  type ArticleRemoval,
  type CatalogEntry,
  type CatalogRead
} from "@/lib/catalog/article";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { copyImageTo, createImage, publishImageToMajority } from "@/lib/media/image";
import {
  holdersOf,
  newestEvents,
  publishCopies,
  publishToRelays,
  queryRelaysPaged
} from "@/lib/nostr/pool";
import {
  catalogReaderAt,
  deriveCatalogKeys,
  deriveCatalogWriter,
  isEarlierEpochKey,
  type CatalogReader,
  type TeamKeys
} from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { currencyDigits } from "@/lib/terminal/amount";
import { sameRelayList } from "@/lib/relays/list";

/*
 * The owner's side of the catalogue ("Items"): listing the articles, adding, changing and removing
 * one. Needs the account open (the passkey): the catalogue's keys derive from the team's root
 * (deriveCatalogKeys), wiped with it when the account closes. The articles go to the account's
 * relays.
 */

export type CatalogErrorCode =
  /** No account open, or its sign-up is not done. */
  | "noAccount"
  /** No name, or no price. */
  | "invalid"
  /** MAX_ARTICLES reached. */
  | "tooMany"
  /** No majority of the relays took the photo or the article: nothing was saved. */
  | "unreachable";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  /**
   * "unreachable": the entry published, which a minority of the relays may hold. Saved again, the
   * same article is published, dated after it (addArticle's and updateArticle's `attempt`): a
   * device reading one of those relays never lists it twice.
   */
  readonly attempt: CatalogEntry | null;

  constructor(code: CatalogErrorCode, message: string, attempt: CatalogEntry | null = null) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.attempt = attempt;
  }
}

/** Articles whose photos are copied at once after a change of relays (copyCatalog). */
const COPIES_AT_ONCE = 5;

type OpenCatalog = { team: TeamKeys; relays: string[]; currency: string };

function openCatalog(): OpenCatalog {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  if (!team || !settings || settings.signUp !== "done") {
    throw new CatalogError("noAccount", "No finished account is open");
  }
  return { team, relays: settings.relays, currency: settings.displayCurrency };
}

/**
 * A call to the account's relays as the catalogue's author. Its key derives again at each
 * authentication: refused once the account closes (its team keys wiped, usableTeamKeys).
 */
function catalogCall(team: TeamKeys, relays: readonly string[], timeoutMs: number) {
  return {
    relays,
    timeoutMs,
    channel: "account" as const,
    authKey: () => deriveCatalogKeys(team).nostr.secretKey
  };
}

/**
 * The catalogue's epoch now, from the roster as this device read it on a majority of the relays
 * since the account opened (every removal made until then is in it), else as a read now gives it;
 * null when no majority answered: no epoch can be told.
 */
export async function currentCatalogEpoch(
  team: TeamKeys,
  relays: readonly string[]
): Promise<number | null> {
  const known = knownRoster(team);
  if (known?.everRead) return catalogEpochOf(known.roster);
  const read = await readRoster(team, relays);
  return read.everRead ? catalogEpochOf(read.roster) : null;
}

/**
 * The catalogue's epoch from the roster read again now on a majority of the relays (read as the
 * article's form opens, "Save" waiting for it), what an article added or changed is sealed with
 * (addArticle, updateArticle): a removal made on another of the owner's devices, even a moment ago,
 * is in it, so that the employee removed never reads the article. Null when no majority answered (a
 * removal may be missing: nothing is saved then), or without an open account. Never rejects.
 */
export async function refreshCatalogEpoch(): Promise<number | null> {
  try {
    const { team, relays } = openCatalog();
    const read = await readRoster(team, relays);
    return read.status === "read" ? catalogEpochOf(read.roster) : null;
  } catch {
    // No account open, or closed meanwhile (its team keys wiped).
    return null;
  }
}

/**
 * What reads every article for the owner (catalogReaderAt): at the epoch now, else at the one this
 * device knows of (the epochs after it are tried too).
 */
async function ownerReader(team: TeamKeys, relays: readonly string[]): Promise<CatalogReader> {
  const epoch = await currentCatalogEpoch(team, relays).catch(() => null);
  const known = knownRoster(team);
  return catalogReaderAt(team, epoch ?? (known ? catalogEpochOf(known.roster) : 0));
}

/** The currency an article's price is typed in: the account's display currency. */
export function priceCurrency(): { currency: string; digits: number } {
  const currency = getAccountSettings()?.displayCurrency ?? "CHF";
  return { currency, digits: currencyDigits(currency) };
}

/** Every article of the business, from the account's relays (fetchArticles). */
export async function loadCatalog(): Promise<CatalogRead> {
  const { team, relays } = openCatalog();
  const reader = await ownerReader(team, relays);
  return fetchArticles(reader, catalogCall(team, relays, TEAM_TIMEOUT_MS.waiting));
}

/** What the owner typed ("New item", "Edit the item"). */
export type ArticleDraft = {
  name: string;
  description: string;
  /**
   * Integer, in minor units (parseFiatMinor): of the display currency for a new article, of the
   * article's own currency for a change (priceCurrencyOf).
   */
  priceMinor: number;
  /** A new photo: a square JPEG (pick-image.ts, "article"); null to keep the article's, or none. */
  photo: Uint8Array | null;
  /** The EAN / UPC scanned, null when typed. */
  barcode: string | null;
};

/** The name and description saved: trimmed, within their lengths. */
function savedTexts(draft: ArticleDraft): { name: string; description: string } {
  return {
    name: draft.name.trim().slice(0, ARTICLE_NAME_MAX_LENGTH),
    description: draft.description.trim().slice(0, ARTICLE_DESCRIPTION_MAX_LENGTH)
  };
}

/** The name and description saved (savedTexts). Throws "invalid". */
function checkedDraft(draft: ArticleDraft): { name: string; description: string } {
  const texts = savedTexts(draft);
  if (texts.name === "" || !Number.isSafeInteger(draft.priceMinor) || draft.priceMinor < 0) {
    throw new CatalogError("invalid", "An article needs a name and a price");
  }
  return texts;
}

/**
 * Whether saving `draft` would change `article` ("Save" only once something changed), compared as
 * updateArticle saves it: the texts trimmed (a space typed at the end changes nothing), the price
 * in minor units ("3.6" is "3.60"), a new photo, the barcode.
 */
export function changesArticle(article: Article, draft: ArticleDraft): boolean {
  const { name, description } = savedTexts(draft);
  return (
    name !== article.name ||
    description !== article.description ||
    draft.priceMinor !== article.price.minor ||
    draft.photo !== null ||
    draft.barcode !== article.barcode
  );
}

/** Publishes a new photo (an image record) once a majority of the relays took it: its reference. */
async function publishPhoto(photo: Uint8Array, relays: readonly string[], at: number) {
  const created = createImage(photo, at);
  try {
    await publishImageToMajority(created.event, created.ref, relays);
  } catch {
    throw new CatalogError("unreachable", "No majority of the relays took the photo");
  }
  rememberImage(created.ref, photo);
  return created.ref;
}

/**
 * Publishes an article's record, or its removal, sealed with the catalogue's key of `epoch`, once a
 * majority of the relays took it (publishArticle). CatalogError "unreachable" when no majority
 * took it.
 */
async function publishEntry(
  team: TeamKeys,
  relays: readonly string[],
  entry: CatalogEntry,
  epoch: number
) {
  try {
    await publishArticle(
      articleEvent(deriveCatalogWriter(team, epoch), entry),
      catalogCall(team, relays, TEAM_TIMEOUT_MS.background)
    );
  } catch {
    throw new CatalogError("unreachable", "No majority of the relays took the article", entry);
  }
}

/**
 * When a change of `article` is dated: now, and always after its last version, so that relays keep
 * the change (they keep the newest event of an address and refuse an older one).
 */
function changedAt(article: Article): number {
  return Math.max(nowUnix(), article.updatedAt + 1);
}

/** The currency a price of `article` is typed in: its own, never the display currency. */
export function priceCurrencyOf(article: Article): { currency: string; digits: number } {
  return { currency: article.price.currency, digits: article.price.digits };
}

/** Rejects with a CatalogError "unreachable" without the epoch of now (refreshCatalogEpoch). */
function knownEpoch(epoch: number | null): number {
  if (epoch === null) throw new CatalogError("unreachable", "The catalogue's epoch is not known");
  return epoch;
}

/**
 * Adds an article: its photo first (an image record, src/lib/media/image.ts), then the article
 * naming it, sealed with the key of `epoch` (refreshCatalogEpoch), each saved once a majority of
 * the relays took it. `count` is how many articles the screen lists. Rejects with a CatalogError:
 * "unreachable" when the epoch is not known (null: nothing is published), or no majority took one
 * of them (nothing is listed; a photo some relays took stays there, named by nothing; the article
 * may be there: CatalogError's `attempt`, which `attempt` takes back). `typedIn`: the currency the
 * price was typed in, as the form showed it (the point of sale's, at its scan); the account's
 * display currency by default. `attempt`: the article of a save that failed before (CatalogError's
 * `attempt`), which a minority of the relays may hold: the same article (its id, when it was added),
 * dated after it, so that it replaces it there instead of being listed twice.
 */
export async function addArticle(
  draft: ArticleDraft,
  count: number,
  epoch: number | null,
  { typedIn, attempt }: { typedIn?: { currency: string }; attempt?: Article | null } = {}
): Promise<Article> {
  const opened = openCatalog();
  const { team, relays } = opened;
  const currency = typedIn?.currency ?? opened.currency;
  const { name, description } = checkedDraft(draft);
  if (count >= MAX_ARTICLES) throw new CatalogError("tooMany", "Too many articles");
  const sealedAt = knownEpoch(epoch);
  const createdAt = attempt?.createdAt ?? nowUnix();
  const updatedAt = attempt ? changedAt(attempt) : createdAt;
  const image = draft.photo ? await publishPhoto(draft.photo, relays, updatedAt) : null;
  const article: Article = {
    version: 1,
    id: attempt?.id ?? newArticleId(),
    name,
    description,
    price: { minor: draft.priceMinor, digits: currencyDigits(currency), currency },
    image,
    barcode: draft.barcode,
    createdAt,
    updatedAt
  };
  await publishEntry(team, relays, article, sealedAt);
  return article;
}

/**
 * Changes `article` ("Edit the item"): its record again, dated after its last version, with a new
 * photo first when one was picked (the old one stays on the relays, named by nothing). The price
 * stays in the article's own currency. The last change saved wins, from any of the owner's devices.
 * Sealed with the key of `epoch` (refreshCatalogEpoch). Rejects with a CatalogError as addArticle;
 * nothing changes then. `attempt`: as addArticle's, the change of a save that failed before: this
 * one is dated after it.
 */
export async function updateArticle(
  article: Article,
  draft: ArticleDraft,
  epoch: number | null,
  attempt: Article | null = null
): Promise<Article> {
  const { team, relays } = openCatalog();
  const { name, description } = checkedDraft(draft);
  const sealedAt = knownEpoch(epoch);
  const updatedAt = Math.max(changedAt(article), attempt ? changedAt(attempt) : 0);
  const image = draft.photo ? await publishPhoto(draft.photo, relays, updatedAt) : article.image;
  const changed: Article = {
    ...article,
    name,
    description,
    price: { ...article.price, minor: draft.priceMinor },
    image,
    barcode: draft.barcode,
    updatedAt
  };
  await publishEntry(team, relays, changed, sealedAt);
  return changed;
}

/**
 * Removes `article`: its removal at its address, dated after its last version, saved once a
 * majority of the relays took it. Sealed with the epoch this device knows (currentCatalogEpoch, no
 * read waited for: a removal tells nothing of the article). Rejects with a CatalogError:
 * "unreachable" when the epoch cannot be told or no majority took it (the article stays). Resolves
 * with the removal published.
 */
export async function removeArticle(article: Article): Promise<ArticleRemoval> {
  const { team, relays } = openCatalog();
  const epoch = knownEpoch(await currentCatalogEpoch(team, relays).catch(() => null));
  const removal: ArticleRemoval = {
    version: 1,
    id: article.id,
    removed: true,
    updatedAt: changedAt(article)
  };
  await publishEntry(team, relays, removal, epoch);
  return removal;
}

/**
 * Copies the catalogue to the relays `next` after a change of the account's relays ("Settings",
 * changeRelays): read once on `before`, every article as it is (newestEvents, publishCopies), then
 * the photo of each (copyImageTo). Resolves with whether it is whole there: a majority of `before`
 * answered, a majority of `next` holds each article, and each photo was found. Never rejects.
 */
export async function copyCatalog(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  try {
    const keys = await ownerReader(team, before);
    const call = catalogCall(team, before, TEAM_TIMEOUT_MS.background);
    const answers = await queryRelaysPaged(catalogFilter(keys), call, { quorum: "majority" });
    if (answers.size < majority(before.length)) {
      logFailure("Copying the catalogue to the new relays failed: too few relays answered");
      return false;
    }
    // The copies relays keep, one per article: their photos are those to copy. Each until a
    // majority of the new list holds it (the relays of both lists that sent it count), where the
    // point of sale reads them from a majority.
    const events = newestEvents(answers);
    const held = await publishCopies(events, call, next, holdersOf(answers, events));
    const images = articlesOf(keys, events).articles.flatMap(({ image }) => (image ? [image] : []));
    const found = await inBatches(images, COPIES_AT_ONCE, async (image) =>
      copyImageTo(image, next, before)
    );
    return held === events.length && found !== null && found.every(Boolean);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): copied again at its next opening.
    logFailure("Copying the catalogue to the new relays failed", error);
    return false;
  }
}

/**
 * Seals the catalogue again with the key of `epoch` (an employee removed loses the catalogue), on
 * the account's relays `relays`: every entry (article or removal) whose newest copy is sealed with
 * the key of an epoch before is published again, dated after it, at its address (relays keep the
 * newest event of an address: the copy an employee removed since could read is replaced), and a
 * relay that answered with an older copy than the newest gets the newest. An entry sealed with the
 * key of an epoch after (another of the owner's devices knows of a later removal) is left as it is,
 * as one of a newer format. Only from what a majority of the relays gave (majority): an entry dated
 * again from a minority's older copy would replace on every relay a newer one (an edit, a removal)
 * the others hold. Epoch 0 has nothing to seal again. Resolves with whether every entry is sealed
 * with the key of `epoch` or after on a relay at least; false when no majority answered. Never
 * rejects.
 */
export async function sealCatalogAgain(
  team: TeamKeys,
  epoch: number,
  relays: readonly string[]
): Promise<boolean> {
  // No employee removed yet: every key the catalogue was sealed with is the current one.
  if (epoch === 0) return true;
  try {
    const reader = catalogReaderAt(team, epoch);
    const writer = deriveCatalogWriter(team, epoch);
    const call = catalogCall(team, relays, TEAM_TIMEOUT_MS.background);
    const answers = await queryRelaysPaged(catalogFilter(reader), call, { quorum: "majority" });
    if (answers.size < majority(relays.length)) return false;
    const { copies, newer } = catalogEntriesOf(reader, [...answers.values()].flat());
    const stale = [...copies.values()].filter(
      ({ keyIndex, event, entry }) =>
        isEarlierEpochKey(keyIndex) &&
        (newer.get(articleAddress(reader, entry.id)) ?? -1) < event.created_at
    );
    const now = nowUnix();
    // Every stale entry is tried: one no majority took does not keep the others readable. Sealed
    // again at the next sync until a majority holds it: the point of sale reads the current and the
    // previous epoch's keys only, from a majority (pos-catalog.ts).
    const sealed = await inBatches(stale, COPIES_AT_ONCE, async ({ entry }) => {
      const updatedAt = Math.max(now, entry.updatedAt + 1);
      const took = await publishToRelays(articleEvent(writer, { ...entry, updatedAt }), call, {
        quorum: "majority"
      });
      return took.length >= majority(relays.length);
    });
    // The relays that answered without the newest copy of an entry sealed already (a publication
    // cut short): given it, so that none keeps one an employee removed since could read.
    const current = [...copies.values()].filter(({ keyIndex }) => !isEarlierEpochKey(keyIndex));
    await Promise.all(
      [...answers].map(async ([relay, events]) => {
        const held = new Set(newestEvents(new Map([[relay, events]])).map((e) => e.id));
        const lacking = current
          .filter(({ event }) => !held.has(event.id))
          .map(({ event }) => event);
        if (lacking.length > 0) await publishCopies(lacking, call, [relay]);
      })
    );
    return sealed !== null && sealed.every(Boolean);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): sealed again at the next sync.
    logFailure("Sealing the catalogue again failed", error);
    return false;
  }
}
