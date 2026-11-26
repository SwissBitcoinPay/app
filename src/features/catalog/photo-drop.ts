import type { RefObject } from "react";
import type { ViewInstance } from "react-native";

/**
 * Drops of a photo onto a view ("Items", desktop: "Drop a photo here"): the web only
 * (photo-drop.web.ts). The apps have no drag and drop: nothing to do.
 */
export function usePhotoDrop(
  _target: RefObject<ViewInstance | null>,
  _onDrop: (bytes: Promise<Uint8Array | null>) => void
): { dragging: boolean } {
  return { dragging: false };
}
