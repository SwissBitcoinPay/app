import type { PasskeyClient } from "@breeztech/breez-sdk-spark/web";

import { PASSKEY_RP_NAME, WALLET_LABEL, getPasskeyRpId, passkeyUserName } from "./config";
import { PasskeyError, type PasskeyErrorCode } from "./errors";
import type { WalletSeed } from "./types";
import { WebPasskeyPrfProvider } from "./web-prf-provider";
import { isBreezWebLoaded, loadBreezWeb, type BreezWeb } from "./web-sdk";

/** Same API as passkey.ts. */
export type PasskeyWallet = { seed: WalletSeed; credentialId: ArrayBuffer | null };

/** A copy that owns its buffer, as the app keeps credential ids as `ArrayBuffer`s. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/**
 * Loads the web SDK (12.7 MB of WebAssembly) ahead of the first tap. Safari only allows a passkey
 * prompt shortly after a user gesture: loading the SDK after the tap could outlast that window.
 * Resolves once the load is over, even when it failed (offline): the next passkey call loads it
 * again and reports the failure.
 */
export function preparePasskeys(): Promise<void> {
  if (typeof WebAssembly === "undefined") return Promise.resolve();
  return loadBreezWeb().then(
    () => undefined,
    () => undefined
  );
}

/**
 * Whether a tap can ask for the passkey at once: the web SDK is loaded (see preparePasskeys). A
 * browser without WebAssembly has nothing to wait for: the passkey calls report it.
 */
export function passkeysReady(): boolean {
  return typeof WebAssembly === "undefined" || isBreezWebLoaded();
}

/**
 * Creates a passkey and derives its wallet, like passkey.ts: within the derivation of `signIn`,
 * which publishes nothing to Nostr (not `PasskeyClient.register()`, see passkey.ts).
 *
 * The passkeys belong to the RP ID of the build (PASSKEY_RP_ID). The browser allows it when the
 * web app is served on that host (the staging web app is), or when the RP host lists the web
 * app's origin in its `/.well-known/webauthn` (Related Origin Requests; Chrome, Safari, Firefox
 * from 152 with a consent prompt).
 */
export function createPasskeyWallet(now: Date = new Date()): Promise<PasskeyWallet> {
  return withPasskeyClient(passkeyUserName(now), (client, provider) => {
    provider.expectCreation();
    return signIn(client);
  });
}

/** Same as passkey.ts. */
export function signInWithPasskey(credentialId?: ArrayBuffer): Promise<PasskeyWallet> {
  return withPasskeyClient(undefined, (client) => signIn(client, credentialId));
}

async function signIn(client: PasskeyClient, credentialId?: ArrayBuffer): Promise<PasskeyWallet> {
  // With a label: the fast path, which neither queries nor publishes to the label store (Nostr).
  const response = await client.signIn({
    label: WALLET_LABEL,
    allowCredentials: credentialId ? [new Uint8Array(credentialId)] : undefined
  });
  return {
    seed: response.wallet.seed as unknown as WalletSeed,
    credentialId: response.credential ? toArrayBuffer(response.credential.credentialId) : null
  };
}

async function withPasskeyClient<T>(
  userName: string | undefined,
  flow: (client: PasskeyClient, provider: WebPasskeyPrfProvider) => Promise<T>
): Promise<T> {
  const rpId = getPasskeyRpId();
  if (typeof WebAssembly === "undefined") {
    throw new PasskeyError("unsupported", "This browser does not run WebAssembly");
  }
  let web: BreezWeb;
  try {
    web = await loadBreezWeb();
  } catch (error) {
    throw new PasskeyError("failed", "The Breez SDK web build could not be loaded", {
      cause: error
    });
  }
  const provider = new WebPasskeyPrfProvider(
    new web.passkeys.PasskeyProvider({
      rpId,
      rpName: PASSKEY_RP_NAME,
      userName,
      userDisplayName: userName
    })
  );
  let client: PasskeyClient;
  try {
    // No Breez API key and no config: they only serve the label store, never used here.
    client = new web.sdk.PasskeyClient(provider);
  } catch (error) {
    throw toPasskeyError(web, provider, error);
  }
  try {
    // "prfUnsupported" here is a browser without WebAuthn (see webAuthnAvailable).
    const availability = await client.checkAvailability();
    if (availability.type === "prfUnsupported") {
      throw new PasskeyError("unsupported", "This browser has no WebAuthn");
    }
    // "notAssociated" does not occur with the web bindings of 0.28.4 (see web-prf-provider.ts).
    if (availability.type === "notAssociated") {
      throw new PasskeyError("notAssociated", `${availability.source}: ${availability.reason}`);
    }
    return await flow(client, provider);
  } catch (error) {
    throw toPasskeyError(web, provider, error);
  } finally {
    client.free();
  }
}

/** Errors of the web SDK to the codes of the passkey layer, from the provider's error class. */
function toPasskeyError(
  web: BreezWeb,
  provider: WebPasskeyPrfProvider,
  error: unknown
): PasskeyError {
  if (error instanceof PasskeyError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code = passkeyErrorCode(web, provider.lastError);
  // Whatever failed after the creation, the passkey exists: never create another one. Unless it
  // gives no PRF output: signing in with it would fail the same way (as passkey.ts).
  if (provider.createdCredentialId && code !== "prfUnsupported") {
    return new PasskeyError("createdNotDerived", message, {
      cause: error,
      credentialId: toArrayBuffer(provider.createdCredentialId)
    });
  }
  return new PasskeyError(code, message, { cause: error });
}

function passkeyErrorCode(web: BreezWeb, providerError: unknown): PasskeyErrorCode {
  const { passkeys } = web;
  if (providerError instanceof passkeys.PasskeyUserCancelledError) return "cancelled";
  if (providerError instanceof passkeys.PasskeyTimedOutError) return "timedOut";
  if (providerError instanceof passkeys.PasskeyCredentialNotFoundError) return "noCredential";
  if (providerError instanceof passkeys.PasskeyAlreadyExistsError) return "alreadyExists";
  if (!(providerError instanceof Error)) return "failed";
  // Plain Errors of the provider of 0.28.4, told apart by their message.
  const { message } = providerError;
  // No PRF output from the passkey, or from the password manager that has just created one (that
  // passkey is left unused; the provider does not give its id).
  if (
    message === "PRF not supported by authenticator" ||
    message.startsWith("Passkey created, but the active credential provider does not support")
  ) {
    return "prfUnsupported";
  }
  // The browser's SecurityError: this origin may not use the RP ID, i.e. it is not listed in the
  // `/.well-known/webauthn` of the RP host, or that file could not be fetched.
  if (message.startsWith("Authentication failed: ")) return "notAssociated";
  return "failed";
}
