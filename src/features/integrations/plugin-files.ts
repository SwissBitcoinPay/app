import { Asset } from "expo-asset";
import { File } from "expo-file-system";

/**
 * The bytes of a plugin's file bundled with the app (wix-plugin.ts), in the apps: expo-asset gives
 * the app's own copy of it, read from the device (the web: plugin-files.web.ts). Throws when it does
 * not read.
 */
export async function readBundledFile(source: number | string): Promise<Uint8Array> {
  const asset = await Asset.fromModule(source).downloadAsync();
  if (!asset.localUri) throw new Error("The bundled file has no local copy");
  return new File(asset.localUri).bytesSync();
}
