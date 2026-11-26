/**
 * Fake of @breeztech/breez-sdk-spark-react-native/passkey-prf-provider for Jest (jest.setup.ts):
 * the built-in `PasskeyProvider` calls a native module. Its methods delegate to `platform`, which
 * tests drive; by default the device supports passkeys and evaluates PRF at creation, and the
 * PRF output of a salt depends on the salt only (like a single passkey).
 *
 * Same shapes as the real provider, `null`s included.
 */

export class PasskeyPrfException extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PasskeyPrfException";
    this.code = code;
  }
}

/** Fake PRF output: 32 bytes that only depend on the salt. */
export function prfOutput(salt: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < salt.length; i++) {
    bytes[i % 32] = (bytes[i % 32] * 31 + salt.charCodeAt(i)) % 256;
  }
  return bytes;
}

export const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4]);

type Association =
  | { kind: "Associated" }
  | { kind: "NotAssociated"; source: string; reason: string }
  | { kind: "Skipped"; reason: string };

type Credential = {
  credentialId: Uint8Array;
  userId: Uint8Array | null;
  aaguid: Uint8Array | null;
  backupEligible: boolean | null;
};

type DeriveRequest = {
  salts: string[];
  allowCredentials?: Uint8Array[];
  preferImmediatelyAvailableCredentials?: boolean | null;
};

const defaults = {
  isSupported: async () => true,
  checkDomainAssociation: async (): Promise<Association> => ({ kind: "Skipped", reason: "Test" }),
  createPasskey: async (
    excludeCredentials: Uint8Array[],
    salts: string[]
  ): Promise<{ credential: Credential; seeds: Uint8Array[] | null }> => ({
    credential: {
      credentialId: CREDENTIAL_ID,
      userId: new Uint8Array([9, 9]),
      aaguid: null,
      backupEligible: true
    },
    seeds: salts.map(prfOutput)
  }),
  deriveSeeds: async (
    request: DeriveRequest
  ): Promise<{ seeds: Uint8Array[]; credentialId?: Uint8Array }> => ({
    seeds: request.salts.map(prfOutput),
    credentialId: CREDENTIAL_ID
  })
};

/** The native passkey module, as tests drive it. */
export const platform = {
  isSupported: jest.fn(defaults.isSupported),
  checkDomainAssociation: jest.fn(defaults.checkDomainAssociation),
  createPasskey: jest.fn(defaults.createPasskey),
  deriveSeeds: jest.fn(defaults.deriveSeeds)
};

/** Back to the defaults, dropping calls and queued `…Once` behaviours. */
export function resetPlatform(): void {
  for (const [name, implementation] of Object.entries(defaults)) {
    platform[name as keyof typeof platform].mockReset();
    (platform[name as keyof typeof platform] as jest.Mock).mockImplementation(implementation);
  }
  PasskeyProvider.mockClear();
}

export const PasskeyProvider = jest.fn(function (
  this: Record<string, unknown>,
  options: Record<string, unknown>
) {
  this.options = options;
  this.isSupported = () => platform.isSupported();
  this.checkDomainAssociation = () => platform.checkDomainAssociation();
  this.createPasskey = (excludeCredentials: Uint8Array[] = [], salts: string[] = []) =>
    platform.createPasskey(excludeCredentials, salts);
  this.deriveSeeds = (request: DeriveRequest) => platform.deriveSeeds(request);
});
