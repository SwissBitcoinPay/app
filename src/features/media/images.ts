import { useEffect, useState } from "react";

import { bytesToBase64 } from "@/lib/base64";
import { IMAGE_MIME, fetchImage, type ImageRef } from "@/lib/media/image";
import { currentRelays } from "@/lib/relays/current";

/*
 * The images the screens show (the business's logo, the employees' photos), read from the relays
 * (src/lib/media/image.ts) once per launch, then from memory, as data URIs: an image never changes
 * (a new one has a new reference). Not kept on the device: the next launch reads them again.
 */

const loaded = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();

function keyOf(ref: ImageRef): string {
  return `${ref.key}.${ref.hash}`;
}

/** A data URI of `bytes`, a JPEG. */
export function imageUri(bytes: Uint8Array): string {
  return `data:${IMAGE_MIME};base64,${bytesToBase64(bytes)}`;
}

/** Keeps `bytes` as the image of `ref` (just picked and published): shown at once. */
export function rememberImage(ref: ImageRef, bytes: Uint8Array): void {
  loaded.set(keyOf(ref), imageUri(bytes));
}

/**
 * The data URI of the image `ref` names, from `relays` (the device's unless a caller names
 * another list); null when none holds it.
 */
export function loadImage(
  ref: ImageRef,
  relays: readonly string[] = currentRelays()
): Promise<string | null> {
  const key = keyOf(ref);
  const known = loaded.get(key);
  if (known) return Promise.resolve(known);
  // A read is shared only by callers of the same list: one on another list may find it where
  // this one does not.
  const readKey = `${key} ${relays.join(" ")}`;
  let running = loading.get(readKey);
  if (!running) {
    running = fetchImage(ref, relays)
      .then((found) => {
        if (found.status !== "found") return null;
        const uri = imageUri(found.bytes);
        loaded.set(key, uri);
        return uri;
      })
      // Whatever happened, the next screen showing it asks again: never a failure kept forever.
      .catch(() => null)
      .finally(() => loading.delete(readKey));
    loading.set(readKey, running);
  }
  return running;
}

/**
 * The data URI of the image `ref` names: null while it is read, without one, or when no relay
 * holds it (the initials show meanwhile). Read from `relays` when given (a business the device
 * does not work with yet: an invitation's), else from the device's.
 */
export function useImageUri(ref: ImageRef | null, relays?: readonly string[]): string | null {
  const key = ref ? keyOf(ref) : null;
  const [shown, setShown] = useState<{ key: string; uri: string } | null>(() =>
    key && loaded.has(key) ? { key, uri: loaded.get(key)! } : null
  );
  useEffect(() => {
    if (!ref || !key) return;
    let alive = true;
    void loadImage(ref, relays).then((uri) => {
      if (alive && uri) setShown({ key, uri });
    });
    return () => {
      alive = false;
    };
    // Keyed by the reference: another object of the same image (or list) reads nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return null;
  return shown?.key === key ? shown.uri : (loaded.get(key) ?? null);
}

/** Tests only: forgets the images read. */
export function resetImages(): void {
  loaded.clear();
  loading.clear();
}
