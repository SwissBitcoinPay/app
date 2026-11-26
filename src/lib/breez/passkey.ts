import type { PasskeyClient } from "@breeztech/breez-sdk-spark-react-native";

import { withSystemUi } from "@/lib/system-ui";

import { PASSKEY_RP_NAME, WALLET_LABEL, getPasskeyRpId, passkeyUserName } from "./config";
import { PasskeyError, type PasskeyErrorCode } from "./errors";
import { PasskeyPrfProvider } from "./prf-provider";
import type { WalletSeed } from "./types";

type BreezSdk = typeof import("@breeztech/breez-sdk-spark-react-native");
type PasskeyModule = typeof import("@breeztech/breez-sdk-spark-react-native/passkey-prf-provider");

/** A wallet derived from a passkey. The seed lives in memory only, never stored. */
export type PasskeyWallet = { seed: WalletSeed; credentialId: ArrayBuffer | null };

/** Required lazily, like in wallet.ts: a missing native library must not crash at import time. */
function loadSdk(): { sdk: BreezSdk; passkeys: PasskeyModule } {
  try {
    // The main entry first: it installs the native module the passkey bindings call into.
    /* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
    const sdk = require("@breeztech/breez-sdk-spark-react-native") as BreezSdk;
    const passkeys =
      require("@breeztech/breez-sdk-spark-react-native/passkey-prf-provider") as PasskeyModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { sdk, passkeys };
  } catch (error) {
    throw new PasskeyError("unsupported", "The Breez SDK native library could not be loaded", {
      cause: error
    });
  }
}

/** Nothing to load ahead on native: the SDK is linked in the binary (see passkey.web.ts). */
export function preparePasskeys(): Promise<void> {
  return Promise.resolve();
}

/** Always on native: nothing to load ahead (see passkey.web.ts). */
export function passkeysReady(): boolean {
  return true;
}

/**
 * Creates a passkey and derives its wallet: one biometric prompt where the platform evaluates PRF
 * in the create ceremony, two otherwise (same as the SDK's `register()`).
 *
 * Not `PasskeyClient.register()`: it always publishes the wallet label, in clear, to public Nostr
 * relays and the Breez relay, for a multi-wallet discovery this app does not use: nothing is
 * published. The provider creates the passkey within the derivation of
 * `signIn` instead, which publishes nothing: same salts, so the same wallet. Labels can still be
 * published later, for existing users too, with `PasskeyClient.labels().store()`.
 */
export function createPasskeyWallet(now: Date = new Date()): Promise<PasskeyWallet> {
  // The system's prompt over the app: coming back from it is not leaving (system-ui.ts).
  return withSystemUi(() =>
    withPasskeyClient(passkeyUserName(now), (client, provider) => {
      provider.expectCreation();
      return signIn(client);
    })
  );
}

/**
 * Derives the wallet of a passkey of this app, chosen in the system prompt, or of
 * `credentialId` (recovery of a `createdNotDerived` error).
 */
export function signInWithPasskey(credentialId?: ArrayBuffer): Promise<PasskeyWallet> {
  return withSystemUi(() => withPasskeyClient(undefined, (client) => signIn(client, credentialId)));
}

async function signIn(client: PasskeyClient, credentialId?: ArrayBuffer): Promise<PasskeyWallet> {
  // With a label: the fast path, which neither queries nor publishes to the label store (Nostr).
  const response = await client.signIn({
    label: WALLET_LABEL,
    allowCredentials: credentialId ? [credentialId] : undefined,
    preferImmediatelyAvailableCredentials: undefined
  });
  return {
    seed: response.wallet.seed as unknown as WalletSeed,
    credentialId: response.credential?.credentialId ?? null
  };
}

/** Runs `flow` with a passkey client for the RP of this build, once passkeys are available. */
async function withPasskeyClient<T>(
  userName: string | undefined,
  flow: (client: PasskeyClient, provider: PasskeyPrfProvider) => Promise<T>
): Promise<T> {
  const rpId = getPasskeyRpId();
  const { sdk, passkeys } = loadSdk();
  const provider = new PasskeyPrfProvider(
    sdk,
    passkeys,
    new passkeys.PasskeyProvider({
      rpId,
      rpName: PASSKEY_RP_NAME,
      userName,
      userDisplayName: userName
    })
  );
  let client: PasskeyClient;
  try {
    // No Breez API key and no config: they only serve the label store, never used here.
    client = new sdk.PasskeyClient(provider, undefined, undefined);
  } catch (error) {
    throw toPasskeyError(sdk, error, null);
  }
  try {
    await ensureAvailable(sdk, client);
    return await flow(client, provider);
  } catch (error) {
    throw toPasskeyError(sdk, error, provider.createdCredentialId);
  } finally {
    client.uniffiDestroy();
  }
}

/**
 * Device support, before any system prompt. The domain association is the system's to check,
 * during the ceremony (`notAssociated` where the platform names it, `failed` otherwise): the
 * provider skips the SDK's own check (prf-provider.ts).
 */
async function ensureAvailable(sdk: BreezSdk, client: PasskeyClient): Promise<void> {
  const availability = await client.checkAvailability();
  if (availability.tag === sdk.PasskeyAvailability_Tags.PrfUnsupported) {
    throw new PasskeyError("unsupported", "Passkeys with PRF are not supported on this device");
  }
}

/** SDK errors to the codes of the passkey layer. */
function toPasskeyError(
  sdk: BreezSdk,
  error: unknown,
  createdCredentialId: ArrayBuffer | null
): PasskeyError {
  if (error instanceof PasskeyError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code = passkeyErrorCode(sdk, error);
  // Whatever failed after the creation, the passkey exists: never create another one. Unless its
  // password manager cannot evaluate PRF: signing in with that passkey would fail the same way,
  // the merchant has to use another password manager.
  if (createdCredentialId && code !== "prfUnsupported") {
    return new PasskeyError("createdNotDerived", message, {
      cause: error,
      credentialId: createdCredentialId
    });
  }
  return new PasskeyError(code, message, { cause: error });
}

function passkeyErrorCode(sdk: BreezSdk, error: unknown): PasskeyErrorCode {
  if (!sdk.PasskeyError.instanceOf(error) || error.tag !== sdk.PasskeyError_Tags.Prf) {
    return "failed";
  }
  const [prfError] = error.inner;
  switch (prfError.tag) {
    case sdk.PrfProviderError_Tags.PrfNotSupported:
      return "prfUnsupported";
    case sdk.PrfProviderError_Tags.UserCancelled:
      return "cancelled";
    case sdk.PrfProviderError_Tags.UserTimedOut:
      return "timedOut";
    case sdk.PrfProviderError_Tags.CredentialNotFound:
      return "noCredential";
    case sdk.PrfProviderError_Tags.Configuration:
      return "notAssociated";
    case sdk.PrfProviderError_Tags.CredentialAlreadyExists:
      return "alreadyExists";
    default:
      return "failed";
  }
}
