import type { PasskeyProvider } from "@breeztech/breez-sdk-spark/passkey-prf-provider";
import type {
  CreatePasskeyOutput,
  DeriveSeedOptions,
  DeriveSeedsResult,
  PrfProvider
} from "@breeztech/breez-sdk-spark/web";

/**
 * The web SDK's `PrfProvider` over its browser `PasskeyProvider` (WebAuthn). Unlike on native
 * (prf-provider.ts), the web bindings of Breez SDK 0.28.4 take that provider as is: they map its
 * errors by class name and accept its return values. This wrapper only adds:
 * - the creation of the passkey within `signIn`, as on native (see `expectCreation`);
 * - the last error of the provider: the bindings hand it back as a plain `Error` with a message,
 *   so passkey.web.ts reads its class from here instead of parsing that message.
 *
 * The provider's own domain check (`checkDomainAssociation`) is left out: it only knows the rule
 * of a parent domain, not the related origins (`/.well-known/webauthn` on the RP host) that let
 * the web app use the passkeys of the RP ID. The web `PrfProvider` does not include it anyway, and
 * the browser applies the real rule during the ceremony.
 *
 * Nor is its `isSupported` used (see `webAuthnAvailable`): the ceremony tells what this browser
 * cannot do, with its own error.
 */
export class WebPasskeyPrfProvider implements PrfProvider {
  /** Set by `expectCreation`, for the next `deriveSeeds` only. */
  private creation: { excludeCredentials: Uint8Array[] } | null = null;

  /** The passkey created through this provider, once the create ceremony succeeded. */
  createdCredentialId: Uint8Array | null = null;

  /** The last error thrown by the provider, with its class (PasskeyUserCancelledError, …). */
  lastError: unknown = null;

  constructor(private readonly provider: PasskeyProvider) {}

  /**
   * Makes the next `deriveSeeds` a registration: it creates the passkey with PRF evaluated for
   * the requested salts in the create ceremony, and asserts the new passkey only when the browser
   * did not evaluate it (the fallback of the SDK's `register()` too).
   */
  expectCreation(excludeCredentials: Uint8Array[] = []): void {
    this.creation = { excludeCredentials };
  }

  deriveSeeds = (salts: string[], options?: DeriveSeedOptions): Promise<DeriveSeedsResult> =>
    this.recordingErrors(async () => {
      const creation = this.creation;
      this.creation = null;
      if (!creation) return this.provider.deriveSeeds(salts, options);
      const created = await this.provider.createPasskey(creation.excludeCredentials, salts);
      const credentialId = created.credential.credentialId;
      this.createdCredentialId = credentialId;
      // Only a complete set is usable: some authenticators drop the second PRF output.
      if (created.seeds && created.seeds.length === salts.length) {
        return { seeds: created.seeds, credentialId };
      }
      // Pinned to the new passkey, so that the seed comes from it and not from another one.
      return this.provider.deriveSeeds(salts, { allowCredentials: [credentialId] });
    });

  isSupported = (): Promise<boolean> => Promise.resolve(webAuthnAvailable());

  /** Part of the interface; the flows of this app create passkeys through `expectCreation`. */
  createPasskey = (
    excludeCredentials: Uint8Array[],
    salts: string[]
  ): Promise<CreatePasskeyOutput> =>
    this.recordingErrors(() => this.provider.createPasskey(excludeCredentials, salts));

  supportsImmediateMediation = (): Promise<boolean> =>
    this.recordingErrors(() => this.provider.supportsImmediateMediation());

  private async recordingErrors<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }
}

/**
 * Whether this browser has WebAuthn at all, the only thing told before the passkey is asked for.
 * Not the provider's `isSupported` of 0.28.4: it is `isUserVerifyingPlatformAuthenticatorAvailable()`,
 * which speaks of a passkey built into this device, available right now, only. It is false while
 * the passkey can still be used: on a phone (the browser's QR code), on a security key, in a
 * password manager's extension. Chromium on Linux always answers false (no passkey of its own); an
 * extension may answer for it: Proton Pass (1.44.0, its webauthn.js) answers true only while its
 * part in the page answers it, which it stops while the tab is hidden and restarts when shown, or
 * not until the page reloads. A web app that unlocked before refused to, in Brave on Ubuntu with
 * Proton Pass, its tab left open a long time. What the browser cannot do is told by the
 * ceremony itself, more precisely: no PRF (`prfUnsupported`), no passkey offered (`noCredential`).
 * Without WebAuthn (an old browser, a page not in a secure context), nothing can be asked.
 */
export function webAuthnAvailable(): boolean {
  const { PublicKeyCredential, navigator } = globalThis as {
    PublicKeyCredential?: unknown;
    navigator?: { credentials?: { get?: unknown; create?: unknown } };
  };
  const credentials = navigator?.credentials;
  return (
    typeof PublicKeyCredential === "function" &&
    typeof credentials?.get === "function" &&
    typeof credentials.create === "function"
  );
}
