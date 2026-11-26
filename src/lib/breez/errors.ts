export type WalletErrorCode =
  /** The SDK cannot run here: web build, or native library missing from the binary. */
  | "unavailable"
  /** The build is misconfigured: no Breez API key, or an invalid network in the app config. */
  | "notConfigured"
  /** A wallet is already connected (or connecting): disconnect it first. */
  | "alreadyConnected"
  /** `connect()` of the SDK failed; the SDK error is the `cause`. */
  | "connectFailed"
  /** No wallet is connected: sign in first. */
  | "notConnected"
  /** A request to the connected wallet failed; the SDK error is the `cause`. */
  | "requestFailed";

/** Error of the wallet layer, with a code the screens can map to a message. */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    // Set by hand rather than through the ES2022 `cause` option of Error, so that it does not
    // depend on the JS engine.
    if (options && "cause" in options) this.cause = options.cause;
  }
}

export type PasskeyErrorCode =
  /** No passkey here: web build, or the passkey module is missing from the binary. */
  | "unsupported"
  /** The password manager holding the passkey does not implement the PRF extension. */
  | "prfUnsupported"
  /** The app is not associated with the RP domain (entitlement, association files). */
  | "notAssociated"
  /** The build is misconfigured: no passkey RP ID in the app config. */
  | "notConfigured"
  /** The user dismissed the system prompt. Never retried without a new tap. */
  | "cancelled"
  /** The system prompt closed on its inactivity timeout. */
  | "timedOut"
  /**
   * No password manager offered a passkey of this app: none on the device, or its manager could
   * not answer (Android reports both the same way).
   */
  | "noCredential"
  /** An excluded passkey is already on the device: sign in with it instead. */
  | "alreadyExists"
  /**
   * The passkey was created, then deriving its wallet failed. Recover by signing in with
   * `credentialId`: creating another passkey would leave this one behind.
   */
  | "createdNotDerived"
  /** Any other failure; the SDK or provider error is the `cause`. */
  | "failed";

/** Error of the passkey layer, with a code the screens can map to a message. */
export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  /** The passkey to sign in with, set with `createdNotDerived`. */
  readonly credentialId: ArrayBuffer | null;

  constructor(
    code: PasskeyErrorCode,
    message: string,
    options?: { cause?: unknown; credentialId?: ArrayBuffer }
  ) {
    super(message);
    this.name = "PasskeyError";
    this.code = code;
    this.credentialId = options?.credentialId ?? null;
    // By hand, like WalletError.
    if (options && "cause" in options) this.cause = options.cause;
  }
}

export type SendErrorCode =
  /** Neither a Lightning address, a Lightning invoice, an LNURL nor a Bitcoin address. */
  | "unrecognized"
  /** Recognized, but not something "Send" pays (BOLT12, Spark invoice, LNURL-withdraw…). */
  | "unsupported"
  /** An address or invoice of another Bitcoin network than this build's. */
  | "otherNetwork"
  /** A Lightning invoice past its expiry. */
  | "expired"
  /** A Lightning address whose server could not be reached (or that it does not know). */
  | "unreachable"
  /** An LNURL whose service could not be reached, or answered with an error. */
  | "lnurlUnreachable";

/** Error of `parseSendInput`, with a code the send sheet maps to an instruction. */
export class SendError extends Error {
  readonly code: SendErrorCode;

  constructor(code: SendErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "SendError";
    this.code = code;
    // By hand, like WalletError.
    if (options && "cause" in options) this.cause = options.cause;
  }
}
