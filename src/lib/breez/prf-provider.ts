import type {
  CreatePasskeyOutput,
  DeriveSeedsOutput,
  DeriveSeedsRequest,
  DomainAssociation,
  PrfProvider,
  PrfProviderError
} from "@breeztech/breez-sdk-spark-react-native";
import type { PasskeyProvider } from "@breeztech/breez-sdk-spark-react-native/passkey-prf-provider";

type BreezSdk = typeof import("@breeztech/breez-sdk-spark-react-native");
type PasskeyModule = typeof import("@breeztech/breez-sdk-spark-react-native/passkey-prf-provider");

/** A copy that owns its buffer, as the SDK bindings take `ArrayBuffer`s. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/**
 * The SDK's `PrfProvider` over its built-in React Native `PasskeyProvider`, which cannot be given
 * to `PasskeyClient` as is in Breez SDK 0.28.4 (checked in the SDK and uniffi sources):
 * - it throws `PasskeyPrfException`, not `PrfProviderError`. uniffi hands any other error to Rust
 *   as an unexpected callback error, on which Rust panics (`PrfProviderError` has no
 *   `From<UnexpectedUniFFICallbackError>`), and the SDK is built with `panic = "abort"`: a
 *   dismissed biometric prompt would crash the app. Every method here only throws
 *   `PrfProviderError`;
 * - `createPasskey` returns `null`s where the bindings expect `undefined`: lowering them fails and
 *   the call never settles.
 *
 * Its domain check (`checkDomainAssociation`) is left out, see ours. It also creates the passkey
 * of the registration flow, see `expectCreation`.
 */
export class PasskeyPrfProvider implements PrfProvider {
  /** Set by `expectCreation`, for the next `deriveSeeds` only. */
  private creation: { excludeCredentials: Uint8Array[] } | null = null;

  /** The passkey created through this provider, once the create ceremony succeeded. */
  createdCredentialId: ArrayBuffer | null = null;

  constructor(
    private readonly sdk: BreezSdk,
    private readonly passkeys: PasskeyModule,
    private readonly provider: PasskeyProvider
  ) {}

  /**
   * Makes the next `deriveSeeds` a registration: it creates the passkey with PRF evaluated for
   * the requested salts in the create ceremony, and asserts the new passkey only when the
   * platform did not evaluate it (the fallback of the SDK's `register()` too).
   */
  expectCreation(excludeCredentials: ArrayBuffer[] = []): void {
    this.creation = { excludeCredentials: excludeCredentials.map((id) => new Uint8Array(id)) };
  }

  deriveSeeds = async (request: DeriveSeedsRequest): Promise<DeriveSeedsOutput> => {
    const creation = this.creation;
    this.creation = null;
    try {
      if (!creation) {
        return await this.assert(
          request.salts,
          request.allowCredentials,
          request.preferImmediatelyAvailableCredentials
        );
      }
      const created = await this.provider.createPasskey(creation.excludeCredentials, request.salts);
      const credentialId = toArrayBuffer(created.credential.credentialId);
      this.createdCredentialId = credentialId;
      // Only a complete set is usable: some authenticators drop the second PRF output.
      if (created.seeds && created.seeds.length === request.salts.length) {
        return { seeds: created.seeds.map(toArrayBuffer), credentialId };
      }
      // Pinned to the new passkey, so that the seed comes from it and not from another one.
      return await this.assert(request.salts, [credentialId], undefined);
    } catch (error) {
      throw this.toPrfProviderError(error);
    }
  };

  isSupported = async (): Promise<boolean> => {
    try {
      return await this.provider.isSupported();
    } catch (error) {
      throw this.toPrfProviderError(error);
    }
  };

  /** Part of the interface; the flows of this app create passkeys through `expectCreation`. */
  createPasskey = async (
    excludeCredentials: ArrayBuffer[],
    salts: string[]
  ): Promise<CreatePasskeyOutput> => {
    try {
      const { credential, seeds } = await this.provider.createPasskey(
        excludeCredentials.map((id) => new Uint8Array(id)),
        salts
      );
      return {
        credential: {
          credentialId: toArrayBuffer(credential.credentialId),
          userId: credential.userId ? toArrayBuffer(credential.userId) : undefined,
          aaguid: credential.aaguid ? toArrayBuffer(credential.aaguid) : undefined,
          backupEligible: credential.backupEligible ?? undefined
        },
        seeds: seeds ? seeds.map(toArrayBuffer) : undefined
      };
    } catch (error) {
      throw this.toPrfProviderError(error);
    }
  };

  /**
   * Never asks the native module (Breez SDK 0.28.4, checked in its sources and React Native's):
   * - on iOS, its JavaScript passes `rpId` alone where the native method takes `rpId` and
   *   `teamId` before the promise's blocks. React Native's interop layer does not refuse too few
   *   arguments: the `resolve` block lands in `teamId`, bridging it to a Swift `String` raises an
   *   Objective-C exception, rethrown on the module's queue: the app aborted (SIGABRT) at each
   *   "Create my account" and "Log in";
   * - on Android, a `NotAssociated` answer is turned into `Skipped`: its answer never changes the
   *   outcome, only costs a request to Google (Digital Asset Links, up to 3 s).
   * The system checks the association during the ceremony anyway, as on the web
   * (web-prf-provider.ts): a domain not associated fails there.
   */
  checkDomainAssociation = async (): Promise<DomainAssociation> =>
    new this.sdk.DomainAssociation.Skipped({ reason: "Checked by the system's ceremony" });

  private async assert(
    salts: string[],
    allowCredentials: ArrayBuffer[],
    preferImmediatelyAvailableCredentials: boolean | undefined
  ): Promise<DeriveSeedsOutput> {
    const { seeds, credentialId } = await this.provider.deriveSeeds({
      salts,
      allowCredentials: allowCredentials.map((id) => new Uint8Array(id)),
      preferImmediatelyAvailableCredentials: preferImmediatelyAvailableCredentials ?? null
    });
    return {
      seeds: seeds.map(toArrayBuffer),
      credentialId: credentialId ? toArrayBuffer(credentialId) : undefined
    };
  }

  /** Codes of `PasskeyPrfException` (passkey-prf-provider.ts of the SDK) to SDK errors. */
  private toPrfProviderError(error: unknown): PrfProviderError {
    const { PrfProviderError } = this.sdk;
    if (PrfProviderError.instanceOf(error)) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof this.passkeys.PasskeyPrfException)) {
      return new PrfProviderError.Generic(message);
    }
    switch (error.code) {
      case "userCancelled":
        return new PrfProviderError.UserCancelled();
      case "userTimedOut":
        return new PrfProviderError.UserTimedOut();
      case "prfNotSupported":
        return new PrfProviderError.PrfNotSupported();
      case "noCredential":
        return new PrfProviderError.CredentialNotFound(message);
      case "configuration":
        return new PrfProviderError.Configuration(message);
      case "credentialAlreadyExists":
        return new PrfProviderError.CredentialAlreadyExists(message);
      case "authenticationFailed":
        return new PrfProviderError.AuthenticationFailed(message);
      case "prfEvaluationFailed":
        return new PrfProviderError.PrfEvaluationFailed(message);
      default:
        return new PrfProviderError.Generic(message);
    }
  }
}
