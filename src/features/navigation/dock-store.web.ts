import { DOCK_STORE_KEY, parseStoredDock, serializeDock } from "./dock-format";
import type { Destination } from "./destinations";

/** Same API as dock-store.ts, in this browser's `localStorage`. */

export async function loadDock(): Promise<Destination[] | null> {
  try {
    return parseStoredDock(localStorage.getItem(DOCK_STORE_KEY));
  } catch {
    return null;
  }
}

export async function saveDock(dock: readonly Destination[]): Promise<void> {
  localStorage.setItem(DOCK_STORE_KEY, serializeDock(dock));
}
