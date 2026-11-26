import type * as PasskeyModule from "../lib/breez/passkey";
import type * as ProviderFake from "../../jest/breez-passkey-prf-provider";
import type * as SdkFake from "../../jest/breez-sdk";
import { passkeyUserName } from "../lib/breez/config";
import { PasskeyPrfProvider } from "../lib/breez/prf-provider";

const BREEZ_SDK = "@breeztech/breez-sdk-spark-react-native";
const PASSKEY_PROVIDER = "@breeztech/breez-sdk-spark-react-native/passkey-prf-provider";

// See breez-status.test.ts: overrides of the SDK mock must be undone.
const defaultSdkMock: unknown = jest.requireMock(BREEZ_SDK);
const defaultProviderMock: unknown = jest.requireMock(PASSKEY_PROVIDER);

function loadPasskey(extra: Record<string, unknown> = { passkeyRpId: "passkeys.example.com" }) {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra } }
  }));
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
  const passkey = require("../lib/breez/passkey") as typeof PasskeyModule;
  // The instances passkey.ts gets when it requires them lazily (same module registry).
  const sdk = () => require(BREEZ_SDK) as typeof SdkFake;
  const provider = require(PASSKEY_PROVIDER) as typeof ProviderFake;
  /* eslint-enable @typescript-eslint/no-require-imports */
  provider.resetPlatform();
  return { ...passkey, sdk, provider, platform: provider.platform };
}

function bytes(buffer: ArrayBuffer | null | undefined): number[] {
  return buffer ? Array.from(new Uint8Array(buffer)) : [];
}

const SALTS = ["4e594f415354525453414f594e", "Default"];

describe("passkeyUserName", () => {
  it("names each passkey after the local date and time of its creation, to the second", () => {
    expect(passkeyUserName(new Date(2026, 8, 30, 14, 32, 59))).toBe(
      "sattle.me 2026-09-30 14:32:59"
    );
    expect(passkeyUserName(new Date(2027, 0, 5, 9, 7))).toBe("sattle.me 2027-01-05 09:07:00");
  });
});

describe("createPasskeyWallet", () => {
  afterEach(() => {
    jest.doMock(BREEZ_SDK, () => defaultSdkMock);
    jest.doMock(PASSKEY_PROVIDER, () => defaultProviderMock);
  });

  it("creates a passkey on the RP of the build and derives its wallet in one prompt", async () => {
    const { createPasskeyWallet, provider, platform, sdk } = loadPasskey();

    const wallet = await createPasskeyWallet(new Date(2026, 8, 30, 14, 32));

    expect(provider.PasskeyProvider).toHaveBeenCalledWith({
      rpId: "passkeys.example.com",
      rpName: "sattle.me",
      userName: "sattle.me 2026-09-30 14:32:00",
      userDisplayName: "sattle.me 2026-09-30 14:32:00"
    });
    // PRF evaluated at creation: no assertion follows.
    expect(platform.createPasskey).toHaveBeenCalledWith([], SALTS);
    expect(platform.deriveSeeds).not.toHaveBeenCalled();
    expect(bytes(wallet.credentialId)).toEqual([1, 2, 3, 4]);
    expect(wallet.seed).toEqual({
      tag: "Mnemonic",
      inner: { mnemonic: expect.stringMatching(/^mnemonic of /) }
    });
    const { instances } = sdk().PasskeyClient;
    const client = instances[instances.length - 1];
    // No Breez API key: nothing may reach the Nostr label store.
    expect(client.breezApiKey).toBeUndefined();
    expect(client.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("gives the wallet that signing in with the same passkey gives", async () => {
    const { createPasskeyWallet, signInWithPasskey } = loadPasskey();

    const created = await createPasskeyWallet();
    const signedIn = await signInWithPasskey();

    expect(signedIn.seed).toEqual(created.seed);
  });

  it("asserts the new passkey when the platform does not evaluate PRF at creation", async () => {
    const { createPasskeyWallet, signInWithPasskey, platform } = loadPasskey();
    const expected = await signInWithPasskey();
    platform.deriveSeeds.mockClear();
    platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: null,
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));

    const wallet = await createPasskeyWallet();

    expect(platform.deriveSeeds).toHaveBeenCalledTimes(1);
    const [request] = platform.deriveSeeds.mock.calls[0];
    expect(request.salts).toEqual(SALTS);
    // Pinned to the new passkey.
    expect(request.allowCredentials?.map((id) => Array.from(id))).toEqual([[7, 7]]);
    expect(wallet.seed).toEqual(expected.seed);
  });

  it("does not create a passkey where passkeys are not supported", async () => {
    const { createPasskeyWallet, platform } = loadPasskey();
    platform.isSupported.mockResolvedValueOnce(false);

    await expect(createPasskeyWallet()).rejects.toMatchObject({
      name: "PasskeyError",
      code: "unsupported"
    });
    expect(platform.createPasskey).not.toHaveBeenCalled();
  });

  // Breez SDK 0.28.4: on iOS its JavaScript calls the native check with one argument of two, and
  // the app aborted (SIGABRT) on both buttons. The system checks the association in the ceremony.
  it("never asks the native module for the domain association", async () => {
    const { createPasskeyWallet, signInWithPasskey, platform } = loadPasskey();

    await expect(createPasskeyWallet()).resolves.toBeDefined();
    await expect(signInWithPasskey()).resolves.toBeDefined();

    expect(platform.checkDomainAssociation).not.toHaveBeenCalled();
  });

  it("reports a domain the system finds not associated during the ceremony", async () => {
    const { createPasskeyWallet, platform, provider } = loadPasskey();
    platform.createPasskey.mockRejectedValueOnce(
      new provider.PasskeyPrfException("configuration", "Not associated")
    );

    await expect(createPasskeyWallet()).rejects.toMatchObject({ code: "notAssociated" });
  });

  it("reports a failure after the creation with the passkey to sign in with", async () => {
    const { createPasskeyWallet, platform, provider } = loadPasskey();
    platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: null,
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));
    platform.deriveSeeds.mockRejectedValueOnce(
      new provider.PasskeyPrfException("userCancelled", "Cancelled")
    );

    const error = await createPasskeyWallet().catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "PasskeyError", code: "createdNotDerived" });
    expect(bytes((error as { credentialId: ArrayBuffer }).credentialId)).toEqual([7, 7]);
  });

  it("says so when the password manager of the created passkey cannot evaluate PRF", async () => {
    const { createPasskeyWallet, platform, provider } = loadPasskey();
    platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: null,
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));
    platform.deriveSeeds.mockRejectedValueOnce(
      new provider.PasskeyPrfException("prfNotSupported", "PRF not supported by authenticator")
    );

    const error = await createPasskeyWallet().catch((e: unknown) => e);

    // Signing in with that passkey would fail the same way: nothing to recover with it.
    expect(error).toMatchObject({ name: "PasskeyError", code: "prfUnsupported" });
    expect((error as { credentialId: ArrayBuffer | null }).credentialId).toBeNull();
  });

  it("reports passkeys as unsupported when the native library is missing", async () => {
    jest.doMock(BREEZ_SDK, () => {
      throw new Error("BreezSdkSparkReactNative could not be found");
    });
    const { createPasskeyWallet } = loadPasskey();

    await expect(createPasskeyWallet()).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuses a build without passkey domain", async () => {
    const { createPasskeyWallet } = loadPasskey({});

    await expect(createPasskeyWallet()).rejects.toMatchObject({ code: "notConfigured" });
  });
});

describe("signInWithPasskey", () => {
  afterEach(() => {
    jest.doMock(BREEZ_SDK, () => defaultSdkMock);
  });

  it("lets the system offer any passkey of the app, without creating one", async () => {
    const { signInWithPasskey, platform, provider } = loadPasskey();

    const wallet = await signInWithPasskey();

    expect(provider.PasskeyProvider).toHaveBeenCalledWith(
      expect.objectContaining({ rpId: "passkeys.example.com", userName: undefined })
    );
    expect(platform.createPasskey).not.toHaveBeenCalled();
    expect(platform.deriveSeeds).toHaveBeenCalledWith({
      salts: SALTS,
      allowCredentials: [],
      // The provider's default: passkeys available on this device.
      preferImmediatelyAvailableCredentials: null
    });
    expect(bytes(wallet.credentialId)).toEqual([1, 2, 3, 4]);
  });

  // On Android the system's prompt puts the app in the background: the app's lock must not take
  // it for its holder leaving (src/lib/system-ui.ts), at a sign-in as at a creation.
  it("shows its prompt as a trip of the system's for the app's lock", async () => {
    const { signInWithPasskey, createPasskeyWallet, platform, provider } = loadPasskey();
    /* eslint-disable @typescript-eslint/no-require-imports -- the module graph passkey.ts uses */
    const systemUi = require("../lib/system-ui") as typeof import("../lib/system-ui");
    const { Platform } = require("react-native") as typeof import("react-native");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      const during: ReturnType<typeof systemUi.leavingForSystemUi>[] = [];
      platform.deriveSeeds.mockImplementationOnce(async (request) => {
        during.push(systemUi.leavingForSystemUi());
        return {
          seeds: request.salts.map(provider.prfOutput),
          credentialId: provider.CREDENTIAL_ID
        };
      });
      await signInWithPasskey();
      platform.createPasskey.mockImplementationOnce(async (_excluded, salts) => {
        during.push(systemUi.leavingForSystemUi());
        return {
          credential: {
            credentialId: provider.CREDENTIAL_ID,
            userId: new Uint8Array([9, 9]),
            aaguid: null,
            backupEligible: true
          },
          seeds: salts.map(provider.prfOutput)
        };
      });
      await createPasskeyWallet();
      expect(during).toEqual(["trip", "trip"]);
      expect(systemUi.leavingForSystemUi()).toBeNull();
    } finally {
      android.restore();
    }
  });

  it("signs in with the given passkey", async () => {
    const { signInWithPasskey, platform } = loadPasskey();

    await signInWithPasskey(new Uint8Array([7, 7]).buffer);

    const [request] = platform.deriveSeeds.mock.calls[0];
    expect(request.allowCredentials?.map((id) => Array.from(id))).toEqual([[7, 7]]);
  });

  it.each([
    ["userCancelled", "cancelled"],
    ["userTimedOut", "timedOut"],
    ["prfNotSupported", "prfUnsupported"],
    ["noCredential", "noCredential"],
    ["configuration", "notAssociated"],
    ["credentialAlreadyExists", "alreadyExists"],
    ["authenticationFailed", "failed"],
    ["prfEvaluationFailed", "failed"],
    ["unknown", "failed"]
  ])("maps the provider error %s to %s", async (providerCode, code) => {
    const { signInWithPasskey, platform, provider } = loadPasskey();
    platform.deriveSeeds.mockRejectedValueOnce(
      new provider.PasskeyPrfException(providerCode, "Native error")
    );

    // An SDK error, not a panic: the SDK got a PrfProviderError from the provider.
    await expect(signInWithPasskey()).rejects.toMatchObject({
      name: "PasskeyError",
      code,
      cause: { tag: "Prf" }
    });
  });

  it("hands the SDK an error it can take when the native module fails unexpectedly", async () => {
    const { signInWithPasskey, platform } = loadPasskey();
    platform.deriveSeeds.mockRejectedValueOnce(new Error("Passkey PRF native module failed"));

    await expect(signInWithPasskey()).rejects.toMatchObject({
      code: "failed",
      cause: { tag: "Prf", inner: [{ tag: "Generic" }] }
    });
  });
});

describe("PasskeyPrfProvider.createPasskey", () => {
  it("gives the bindings undefined, never null, for what the platform did not report", async () => {
    const { sdk, provider } = loadPasskey();
    const prf = new PasskeyPrfProvider(
      sdk() as never,
      provider as never,
      new provider.PasskeyProvider({}) as never
    );
    provider.platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7]),
        userId: null,
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));

    const output = await prf.createPasskey([new Uint8Array([5]).buffer], ["salt"]);

    expect(provider.platform.createPasskey).toHaveBeenCalledWith([new Uint8Array([5])], ["salt"]);
    expect(output).toEqual({
      credential: {
        credentialId: new Uint8Array([7]).buffer,
        userId: undefined,
        aaguid: undefined,
        backupEligible: undefined
      },
      seeds: undefined
    });
  });
});
