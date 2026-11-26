import type { CardIssuer } from "@/lib/card/card-record";
import type { LegacyVisual } from "@/lib/card/legacy-visual";

import type { VisualPreview } from "./issuer-visual";

export type { VisualPreview };

/** A browser never shows "Swiss Bitcoin Pay card detected" (NFC): no visual downloaded. */
export function useVisualPreview(_visual: LegacyVisual | null): VisualPreview {
  return { status: "none" };
}

/** A browser never migrates a card (NFC): no visual to keep. */
export async function keepIssuerVisual(
  _visual: LegacyVisual,
  _relays: readonly string[]
): Promise<CardIssuer | null> {
  return null;
}

/** Tests only: nothing to forget. */
export function resetIssuerVisuals(): void {}
