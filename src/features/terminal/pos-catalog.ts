import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { majority } from "@/config/registry";
import { loadImage } from "@/features/media/images";
import { ownerDevicesShared } from "@/features/team/owner-device";
import { inBatches } from "@/lib/batches";
import {
  fetchArticles,
  withCatalogEntry,
  type Article,
  type CatalogEntry
} from "@/lib/catalog/article";
import { catalogReaderOf, type ChannelCatalog } from "@/lib/catalog/reader";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";
import { catalogKeysAhead, type CatalogReader } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { isMemberProfile, type TerminalProfile } from "@/lib/terminal/model";

import { useCatalogKeys } from "./catalog-key";

/*
 * The business's articles at the point of sale ("Amount" / "Items"
 * and the scan): read with the catalogue's reading keys this device holds (catalog-key.ts), in till
 * mode too, as soon as the point of sale is mounted, then again whenever the app comes back to the
 * foreground and every POS_CATALOG_REFRESH_MS. Their photos are read right after (loadImage keeps
 * them for the launch), so that the scan shows each article with its photo at once.
 *
 * Nothing read is not "no article": until a relay answered, and when none did, the point of sale
 * has no articles (an unreadable catalogue is as an empty one), but a
 * catalogue read once is kept through later failures (its articles were proven; a sale may be
 * under way).
 *
 * An article this device saved or removed ("Items", the scan's "New item") counts at
 * once (noteEntry: an article added would otherwise be unknown at the scan until the
 * next read): a majority of the relays took it (publishArticle). It is applied over every read
 * until one that started after it was answered by a majority of the relays asked: any two
 * majorities share a relay, so that read holds it, or a later change of it (a removal made on
 * another of the owner's devices included). A read answered by fewer may lack it.
 */

/** How often the catalogue is read again while the point of sale is mounted. */
export const POS_CATALOG_REFRESH_MS = 5 * 60 * 1000;

/** Photos read at once, per batch: a catalogue of MAX_ARTICLES does not open as many reads. */
const PHOTOS_AT_ONCE = 6;

/**
 * Where the catalogue's reading stands: "reading" until a relay answered (or while its keys are
 * read), "read" once one did, "unreadable" when a read ended without any answer, or without keys
 * to read it with. Only "read" tells that an empty catalogue has no article.
 */
export type PosCatalogState = "reading" | "read" | "unreadable";

/** The articles the point of sale offers, the newest first; empty until read (or unreadable). */
export type PosCatalog = { articles: readonly Article[]; state: PosCatalogState };

const NO_ARTICLES: readonly Article[] = [];

/** Reads the photos of `articles` one batch after the other (loadImage keeps them). */
function preloadPhotos(articles: readonly Article[]): Promise<unknown> {
  const images = articles.flatMap(({ image }) => (image ? [image] : []));
  // A photo no relay holds is not a reason to stop: the others are read on (true, never null).
  return inBatches(images, PHOTOS_AT_ONCE, async (ref) => {
    await loadImage(ref);
    return true;
  });
}

/**
 * The reader of `keys` for `profile`: on one of the owner's devices, with the keys of the
 * CATALOG_EPOCHS_AHEAD epochs after it too (from the secret the owner's devices share), so that its
 * point of sale in till mode still reads the catalogue sealed again after a removal made on another
 * of the owner's devices, before its account opens again. An employee's: its channel's keys only.
 */
async function readerFor(profile: TerminalProfile, keys: ChannelCatalog): Promise<CatalogReader> {
  const reader = catalogReaderOf(keys);
  if (isMemberProfile(profile)) return reader;
  const shared = await ownerDevicesShared(profile.walletId);
  if (!shared) return reader;
  const ahead = catalogKeysAhead(shared, keys.epoch);
  return { ...reader, otherKeys: [...(reader.otherKeys ?? []), ...ahead] };
}

/**
 * The point of sale's articles for `profile`'s account (PosCatalog), and `noteEntry`, for an entry
 * this device published (once a majority of the relays took it).
 */
export function usePosCatalog(profile: TerminalProfile): {
  catalog: PosCatalog;
  noteEntry: (entry: CatalogEntry) => void;
} {
  const keys = useCatalogKeys(profile);
  // By value: the same keys read again (another object) keep the articles shown.
  const id = keys ? JSON.stringify(keys) : null;
  const [held, setHeld] = useState<{ id: string; articles: readonly Article[] } | null>(null);
  /** The keys whose last read ended without any answer, while nothing of theirs was read. */
  const [failed, setFailed] = useState<string | null>(null);
  // One count for the reads' starts and the entries noted: an entry noted after a read started is
  // applied over what it gives.
  const tick = useRef(0);
  const notes = useRef<{ entry: CatalogEntry; at: number }[]>([]);

  useEffect(() => {
    if (!keys || !id) return;
    let alive = true;
    let reading = false;
    const read = () => {
      if (reading) return;
      reading = true;
      const started = ++tick.current;
      const relays = currentRelays();
      readerFor(profile, keys)
        .then((reader) =>
          fetchArticles(reader, {
            channel: "account",
            relays,
            timeoutMs: TEAM_TIMEOUT_MS.background
          })
        )
        .then(async (found) => {
          if (!alive) return;
          // No relay answered: nothing can be told, what was read before stays.
          if (found.answered === 0) {
            setFailed(id);
            return;
          }
          // Answered by a majority: the entries noted before this read started are in what the
          // relays gave (or a later change of them).
          if (found.answered >= majority(relays.length)) {
            notes.current = notes.current.filter(({ at }) => at > started);
          }
          const articles = notes.current.reduce<readonly Article[]>(
            (shown, { entry }) => withCatalogEntry(shown, entry),
            found.articles
          );
          setHeld({ id, articles });
          await preloadPhotos(articles);
        })
        .catch((error: unknown) => {
          logFailure("Reading the point of sale's articles failed", error);
          if (alive) setFailed(id);
        })
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, POS_CATALOG_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      subscription.remove();
    };
    // Keyed by the keys' value (`id`): the same keys read again read nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const noteEntry = (entry: CatalogEntry) => {
    notes.current.push({ entry, at: ++tick.current });
    // Over a catalogue read only: one never read is not told by a single article.
    setHeld((shown) =>
      shown && shown.id === id ? { id, articles: withCatalogEntry(shown.articles, entry) } : shown
    );
  };

  // Only the catalogue of the keys held now: another account's (or none) shows nothing.
  if (id !== null && held?.id === id)
    return { catalog: { articles: held.articles, state: "read" }, noteEntry };
  const state: PosCatalogState =
    keys === null || (id !== null && failed === id) ? "unreadable" : "reading";
  return { catalog: { articles: NO_ARTICLES, state }, noteEntry };
}
