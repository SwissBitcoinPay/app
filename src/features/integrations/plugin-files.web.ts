import { Asset } from "expo-asset";

/**
 * The bytes of a plugin's file bundled with the app (wix-plugin.ts), on the web: Metro exports the
 * file with the web app, at its URL, read from the app's own origin (plugin-files.ts in the apps).
 * Throws when it does not read.
 */
export async function readBundledFile(source: number | string): Promise<Uint8Array> {
  const { uri } = Asset.fromModule(source);
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`The bundled file answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
