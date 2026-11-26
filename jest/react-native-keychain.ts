/**
 * In-memory fake of react-native-keychain (jest.setup.ts), as the v2 app's values are found on a
 * device updated to this app (src/lib/legacy-v2/store.ts): each under the service of its name, some
 * behind the device's biometrics (the v2 app's 12 words). `putLegacyValue` sets what the v2 app left;
 * a read of a value behind the biometrics records its prompt (`prompts`) and gives it unless
 * `biometrics` says the person dismissed it or the system lost its key.
 */

type Entry = { password: string; biometric: boolean };

export const keychain = {
  entries: new Map<string, Entry>(),
  /** The prompts shown, in order (a value behind the biometrics read). */
  prompts: [] as { service: string; title?: string; cancel?: string }[],
  /**
   * What the biometric prompt gives: the value; `dismissed`, the person dismissed it (the library
   * rejects); `lost`, the key behind the value was destroyed (biometrics enrolled since).
   */
  biometrics: "granted" as "granted" | "dismissed" | "lost",
  /** Every read fails, as a keystore the library cannot open. */
  broken: false,
  /** Services reset (resetGenericPassword), in order. */
  resets: [] as string[]
};

/** What the v2 app left under `service`, behind the biometrics when `biometric`. */
export function putLegacyValue(service: string, password: string, biometric = false): void {
  keychain.entries.set(service, { password, biometric });
}

export function resetKeychain(): void {
  keychain.entries.clear();
  keychain.prompts = [];
  keychain.biometrics = "granted";
  keychain.broken = false;
  keychain.resets = [];
}

type Options = {
  service?: string;
  authenticationPrompt?: { title?: string; cancel?: string };
};

export async function getGenericPassword(options: Options = {}) {
  if (keychain.broken) throw new Error("Keystore unavailable");
  const service = options.service ?? "";
  const entry = keychain.entries.get(service);
  if (!entry) return false;
  if (entry.biometric) {
    keychain.prompts.push({ service, ...options.authenticationPrompt });
    if (keychain.biometrics === "dismissed") throw new Error("User canceled the operation");
    if (keychain.biometrics === "lost") throw new Error("Key permanently invalidated");
  }
  return { service, username: service, password: entry.password, storage: "keychain" };
}

export async function hasGenericPassword(options: Options = {}) {
  if (keychain.broken) throw new Error("Keystore unavailable");
  return keychain.entries.has(options.service ?? "");
}

export async function resetGenericPassword(options: Options = {}) {
  const service = options.service ?? "";
  keychain.resets.push(service);
  return keychain.entries.delete(service);
}

export async function setGenericPassword(): Promise<false> {
  throw new Error("This app never writes the v2 app's keychain");
}
