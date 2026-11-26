import { Directory, Paths } from "expo-file-system";

/*
 * What "Log out" removes from the app's cache directory (device-wipe.ts): the files the app
 * makes there, which name the business and hold its data. The CSV of "Export"
 * (src/features/wallet/export/share.ts) and the PDFs of the invoices and statements
 * (src/features/invoices/pdf.ts) stay there after the share sheet closes: Android's share sheet
 * answers as soon as an app is picked, which may read the file later (a mail being written), so
 * they cannot be removed then. A next user of the device must not read them.
 *
 * Removed: every file directly in the cache (the app writes its own there: those exports, a
 * product's photo or a card's visual being made, images saved by the native modules, and the
 * files of older versions of the app), and the directories where the native
 * modules the app calls write what they make for it (NATIVE_OUTPUT_DIRECTORIES). Never the cache's
 * other directories: those of the system and of other libraries (iOS's URL cache, WebView's), which
 * may be in use. The app's journal (`app-log`) goes with clearLog.
 */

/**
 * The cache's directories where the native modules the app calls write their files (each one's
 * native code, SDK 58): expo-print's PDFs, its file kept when renaming it failed (pdf.ts);
 * expo-image-picker's picked images; expo-image-manipulator's saved images; expo-camera's
 * pictures; expo-sharing's copies under another extension (iOS).
 */
export const NATIVE_OUTPUT_DIRECTORIES = [
  "Print",
  "ImagePicker",
  "ImageManipulator",
  "Camera",
  "expo-sharing-tmp"
] as const;

const OUTPUT_DIRECTORIES: ReadonlySet<string> = new Set(NATIVE_OUTPUT_DIRECTORIES);

/**
 * Removes the app's files from its cache directory (see above). Throws when one could not be
 * removed, after trying each of them.
 */
export function clearAppCache(): void {
  const cache = new Directory(Paths.cache);
  if (!cache.exists) return;
  const failures: unknown[] = [];
  for (const entry of cache.list()) {
    if (entry instanceof Directory && !OUTPUT_DIRECTORIES.has(entry.name)) continue;
    try {
      entry.delete();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new Error(`The cache could not be cleared: ${failures.map(String).join("; ")}`);
  }
}
