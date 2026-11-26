import { taprootAddress } from "../../jest/bitcoin";
import type * as WebFake from "../../jest/breez-sdk-web";
import type * as PasskeyWebModule from "../lib/breez/passkey.web";
import type { WalletSeed } from "../lib/breez/types";
import type * as ChainNodeModule from "../lib/breez/chain-node";
import type * as WalletWebModule from "../lib/breez/wallet.web";

// The web build of the SDK (WebAssembly) cannot run under Jest: the *.web.ts files get the fake
// of jest/breez-sdk-web.ts through their loader, web-sdk.ts.
const WEB_SDK = "../lib/breez/web-sdk";

const SALTS = ["4e594f415354525453414f594e", "Default"];

function bytes(buffer: ArrayBuffer | Uint8Array | null | undefined): number[] {
  return buffer ? Array.from(new Uint8Array(buffer)) : [];
}

/** Lets the pending promises run until `mock` was called. */
async function waitForCall(mock: jest.Mock) {
  for (let turn = 0; turn < 100 && mock.mock.calls.length === 0; turn++) await Promise.resolve();
  expect(mock).toHaveBeenCalled();
}

function load(options: { loadError?: Error; passkeyRpId?: string; loaded?: boolean } = {}) {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: {
      expoConfig: {
        extra: {
          breezNetwork: "mainnet",
          passkeyRpId: options.passkeyRpId ?? "passkeys.example.com"
        }
      }
    }
  }));
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
  const fake = require("../../jest/breez-sdk-web") as typeof WebFake;
  fake.resetPlatform();
  const loadBreezWeb = jest.fn(async () => {
    if (options.loadError) throw options.loadError;
    return { sdk: fake, passkeys: fake };
  });
  jest.doMock(WEB_SDK, () => ({ loadBreezWeb, isBreezWebLoaded: () => options.loaded ?? true }));
  return {
    fake,
    loadBreezWeb,
    ...(require("../lib/breez/passkey.web") as typeof PasskeyWebModule),
    ...(require("../lib/breez/wallet.web") as typeof WalletWebModule)
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/**
 * WebAuthn in the browser: its entry points only, the ceremonies are the fake provider's. Jest's
 * environment has none; `without` leaves one out.
 */
function withWebAuthn(without?: "PublicKeyCredential" | "credentials") {
  const page = globalThis as { PublicKeyCredential?: unknown; navigator?: unknown };
  const before = { PublicKeyCredential: page.PublicKeyCredential, navigator: page.navigator };
  page.PublicKeyCredential = without === "PublicKeyCredential" ? undefined : function () {};
  page.navigator = {
    ...(before.navigator as object | undefined),
    credentials: without === "credentials" ? undefined : { get: jest.fn(), create: jest.fn() }
  };
  return () => Object.assign(page, before);
}

describe("passkeys on the web", () => {
  let restoreWebAuthn: () => void;
  beforeEach(() => {
    restoreWebAuthn = withWebAuthn();
  });
  afterEach(() => restoreWebAuthn());

  it("creates a passkey on the RP ID of the build and derives its wallet in one prompt", async () => {
    const { createPasskeyWallet, fake } = load();

    const wallet = await createPasskeyWallet(new Date(2026, 8, 30, 14, 32));

    expect(fake.PasskeyProvider).toHaveBeenCalledWith({
      rpId: "passkeys.example.com",
      rpName: "sattle.me",
      userName: "sattle.me 2026-09-30 14:32:00",
      userDisplayName: "sattle.me 2026-09-30 14:32:00"
    });
    expect(fake.platform.createPasskey).toHaveBeenCalledWith([], SALTS);
    expect(fake.platform.deriveSeeds).not.toHaveBeenCalled();
    expect(bytes(wallet.credentialId)).toEqual([1, 2, 3, 4]);
    const [client] = fake.PasskeyClient.instances;
    // No Breez API key: nothing may reach the Nostr label store.
    expect(client.breezApiKey).toBeUndefined();
    expect(client.free).toHaveBeenCalledTimes(1);
  });

  it("gives the wallet that signing in with the same passkey gives", async () => {
    const { createPasskeyWallet, signInWithPasskey, fake } = load();

    const created = await createPasskeyWallet();
    const signedIn = await signInWithPasskey();

    expect(signedIn.seed).toEqual(created.seed);
    expect(fake.platform.deriveSeeds).toHaveBeenCalledWith(SALTS, {});
  });

  it("asserts the new passkey when the browser does not evaluate PRF at creation", async () => {
    const { createPasskeyWallet, fake } = load();
    fake.platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: new Uint8Array([9]),
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));

    await createPasskeyWallet();

    expect(fake.platform.deriveSeeds).toHaveBeenCalledWith(SALTS, {
      allowCredentials: [new Uint8Array([7, 7])]
    });
  });

  it("signs in with the given passkey", async () => {
    const { signInWithPasskey, fake } = load();

    await signInWithPasskey(new Uint8Array([7, 7]).buffer);

    expect(fake.platform.deriveSeeds).toHaveBeenCalledWith(SALTS, {
      allowCredentials: [new Uint8Array([7, 7])]
    });
  });

  it.each([
    ["PasskeyUserCancelledError", "cancelled"],
    ["PasskeyTimedOutError", "timedOut"],
    ["PasskeyCredentialNotFoundError", "noCredential"],
    ["PasskeyAlreadyExistsError", "alreadyExists"]
  ] as const)("maps the provider error %s to %s", async (errorClass, code) => {
    const { signInWithPasskey, fake } = load();
    fake.platform.deriveSeeds.mockRejectedValueOnce(new fake[errorClass]("From the browser"));

    await expect(signInWithPasskey()).rejects.toMatchObject({ name: "PasskeyError", code });
  });

  it("tells when the passkey gives no PRF output", async () => {
    const { signInWithPasskey, fake } = load();
    fake.platform.deriveSeeds.mockRejectedValueOnce(
      new Error("PRF not supported by authenticator")
    );

    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "prfUnsupported" });
  });

  it("tells when the password manager creating the passkey has no PRF", async () => {
    const { createPasskeyWallet, fake } = load();
    fake.platform.createPasskey.mockRejectedValueOnce(
      new Error(
        "Passkey created, but the active credential provider does not support the WebAuthn PRF " +
          "extension. On iOS, only iCloud Keychain currently supports PRF: switch the default " +
          "provider in Settings → Passwords → Password Options. The orphan passkey can be " +
          "removed in the same settings panel."
      )
    );

    await expect(createPasskeyWallet()).rejects.toMatchObject({ code: "prfUnsupported" });
  });

  it("tells when this origin may not use the passkeys of the RP ID", async () => {
    const { signInWithPasskey, fake } = load();
    // What Chromium says when the RP host does not list the origin (message of the provider).
    fake.platform.deriveSeeds.mockRejectedValueOnce(
      new Error(
        "Authentication failed: The relying party ID is not a registrable domain suffix of, nor " +
          "equal to the current domain. Subsequently, fetching the .well-known/webauthn resource " +
          "of the claimed RP ID was successful, but no listed origin matched the caller."
      )
    );

    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "notAssociated" });
  });

  it("reports any other failure as failed", async () => {
    const { signInWithPasskey, fake } = load();
    fake.platform.deriveSeeds.mockRejectedValueOnce(
      Object.assign(new Error("The operation is insecure."), { name: "NotSupportedError" })
    );

    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "failed" });
  });

  it("reports a failure after the creation with the passkey to sign in with", async () => {
    const { createPasskeyWallet, fake } = load();
    fake.platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: new Uint8Array([9]),
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));
    fake.platform.deriveSeeds.mockRejectedValueOnce(new fake.PasskeyUserCancelledError());

    const error = await createPasskeyWallet().catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "PasskeyError", code: "createdNotDerived" });
    expect(bytes((error as { credentialId: ArrayBuffer }).credentialId)).toEqual([7, 7]);
  });

  it("says so when the created passkey gives no PRF output", async () => {
    const { createPasskeyWallet, fake } = load();
    fake.platform.createPasskey.mockImplementationOnce(async () => ({
      credential: {
        credentialId: new Uint8Array([7, 7]),
        userId: new Uint8Array([9]),
        aaguid: null,
        backupEligible: null
      },
      seeds: null
    }));
    fake.platform.deriveSeeds.mockRejectedValueOnce(
      new Error("PRF not supported by authenticator")
    );

    const error = await createPasskeyWallet().catch((e: unknown) => e);

    // Signing in with that passkey would fail the same way: nothing to recover with it.
    expect(error).toMatchObject({ name: "PasskeyError", code: "prfUnsupported" });
    expect((error as { credentialId: ArrayBuffer | null }).credentialId).toBeNull();
  });

  it.each(["PublicKeyCredential", "credentials"] as const)(
    "does not prompt in a browser without WebAuthn (no %s)",
    async (missing) => {
      restoreWebAuthn();
      restoreWebAuthn = withWebAuthn(missing);
      const { createPasskeyWallet, signInWithPasskey, fake } = load();

      await expect(createPasskeyWallet()).rejects.toMatchObject({ code: "unsupported" });
      await expect(signInWithPasskey()).rejects.toMatchObject({ code: "unsupported" });
      expect(fake.platform.createPasskey).not.toHaveBeenCalled();
      expect(fake.platform.deriveSeeds).not.toHaveBeenCalled();
    }
  );

  // isUserVerifyingPlatformAuthenticatorAvailable() is false while the passkey is on a phone, a
  // security key or in a password manager's extension, and was seen false in a tab left open
  // long: the browser's prompt tells what it can do, never this guess.
  it("asks for the passkey when the browser has no passkey of its own at hand", async () => {
    const { createPasskeyWallet, signInWithPasskey, fake } = load();
    fake.platform.isSupported.mockResolvedValue(false);

    await expect(signInWithPasskey()).resolves.toBeDefined();
    await expect(createPasskeyWallet()).resolves.toBeDefined();
    expect(fake.platform.deriveSeeds).toHaveBeenCalledTimes(1);
    expect(fake.platform.createPasskey).toHaveBeenCalledTimes(1);
    expect(fake.platform.isSupported).not.toHaveBeenCalled();
  });

  it("ignores the provider's own domain check, which does not know related origins", async () => {
    const { signInWithPasskey } = load();

    await expect(signInWithPasskey()).resolves.toBeDefined();
  });

  it("reports a web build that could not load", async () => {
    const { signInWithPasskey } = load({ loadError: new Error("Failed to fetch") });

    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "failed" });
  });

  it("loads the web build ahead of the first tap", async () => {
    const { preparePasskeys, loadBreezWeb } = load();

    await expect(preparePasskeys()).resolves.toBeUndefined();

    expect(loadBreezWeb).toHaveBeenCalledTimes(1);
  });

  it("ends the preparation when the web build cannot be loaded: a tap loads it again", async () => {
    const { preparePasskeys, signInWithPasskey, loadBreezWeb } = load({
      loadError: new Error("Failed to fetch")
    });

    await expect(preparePasskeys()).resolves.toBeUndefined();
    await expect(signInWithPasskey()).rejects.toMatchObject({ code: "failed" });
    expect(loadBreezWeb).toHaveBeenCalledTimes(2);
  });

  it("is ready for a tap once the web build is loaded", () => {
    expect(load({ loaded: false }).passkeysReady()).toBe(false);
    expect(load({ loaded: true }).passkeysReady()).toBe(true);
  });
});

describe("wallet on the web", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  const seed = { type: "mnemonic", mnemonic: "test" } as unknown as WalletSeed;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("connects on the network of the build, with the API key, in its own IndexedDB storage", async () => {
    const { connectWallet, getWalletId, fake } = load();

    await connectWallet(seed);

    expect(fake.connect).toHaveBeenCalledWith({
      config: {
        network: "mainnet",
        apiKey: "test-api-key",
        syncIntervalSecs: 60,
        maxDepositClaimFee: { onchain: { type: "fixed", amount: 300 }, proportionalPpm: undefined },
        watchtowerFeeLadderEnabled: true
      },
      seed,
      storageDir: "breez-sdk-spark"
    });
    await expect(getWalletId()).resolves.toBe("02ab");
  });

  it("names the account of a seed of words without connecting its wallet, its keys freed", async () => {
    const { walletIdOf, fake } = load();
    const words = { type: "mnemonic", mnemonic: "abandon about" } as unknown as WalletSeed;

    await expect(walletIdOf(words)).resolves.toBe(fake.FAKE_WEB_IDENTITY);

    expect(fake.defaultExternalSigners).toHaveBeenCalledWith(
      "abandon about",
      null,
      "mainnet",
      null
    );
    expect(fake.connect).not.toHaveBeenCalled();
    expect(fake.signersMade).toEqual({ count: 1, freed: 1, handlesFreed: 1 });
    // Never another kind of seed: no other way to name the account.
    await expect(
      walletIdOf({ type: "entropy", entropy: [1, 2] } as unknown as WalletSeed)
    ).rejects.toMatchObject({ code: "requestFailed" });
  });

  it("keeps the SDK's chain service, without the watch of deposit addresses", async () => {
    const { connectWallet, fake } = load();

    await connectWallet(seed);

    expect(fake.newRestChainService).toHaveBeenCalledWith(
      "https://mempool.space/api",
      "mainnet",
      "mempoolSpace"
    );
    const inner = await fake.newRestChainService.mock.results[0].value;
    const service = fake.SdkBuilder.last?.chainService as ReturnType<typeof fake.fakeChainService>;
    await expect(service.getAddressUtxos("bc1p…")).resolves.toEqual([]);
    expect(inner.getAddressUtxos).not.toHaveBeenCalled();
    await expect(service.tipHeight()).resolves.toBe(900_000);
    await service.getOutspend("ab", 1);
    await service.recommendedFees();
    expect(inner.getOutspend).toHaveBeenCalledWith("ab", 1);
    expect(inner.recommendedFees).toHaveBeenCalledTimes(1);
  });

  it("reads the merchant's own node first, then mempool.space when it fails and the owner allows it", async () => {
    const { connectWallet, fake } = load();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same module graph
    const { setChainNodeSource } = require("../lib/breez/chain-node") as typeof ChainNodeModule;
    // A node saved in http:// before HTTPS was required: asked over HTTPS only (node.ts).
    setChainNodeSource(() => ({
      url: "http://192.168.1.20:3006",
      fallback: "mempool",
      payers: false
    }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await connectWallet(seed);

      expect(fake.newRestChainService.mock.calls).toEqual([
        ["https://192.168.1.20:3006/api", "mainnet", "mempoolSpace"],
        ["https://mempool.space/api", "mainnet", "mempoolSpace"]
      ]);
      const [node, mempool] = await Promise.all(
        fake.newRestChainService.mock.results.map(
          (result) => result.value as Promise<ReturnType<typeof fake.fakeChainService>>
        )
      );
      const service = fake.SdkBuilder.last?.chainService as ReturnType<
        typeof fake.fakeChainService
      >;
      node.tipHeight.mockRejectedValueOnce(new Error("unreachable"));
      await expect(service.tipHeight()).resolves.toBe(900_000);
      expect(mempool.tipHeight).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("counts the deposits not claimed yet, and gives up the wallet's Lightning address", async () => {
    const { connectWallet, countUnclaimedDeposits, deleteWalletLightningAddress, fake } = load();
    await expect(countUnclaimedDeposits()).rejects.toMatchObject({ code: "notConnected" });
    await connectWallet(seed);
    await expect(countUnclaimedDeposits()).resolves.toBe(0);
    fake.fakeWallet.unclaimedDeposits = [{ txid: "ab".repeat(32), vout: 0, amountSats: 20_000 }];
    await expect(countUnclaimedDeposits()).resolves.toBe(1);

    // None registered: nothing to give up.
    fake.lightningAddresses.clear();
    await expect(deleteWalletLightningAddress("02ab")).resolves.toBe(false);
    fake.lightningAddresses.set("sattleme02ab", "Fine Bakery");
    // Never another wallet's.
    await expect(deleteWalletLightningAddress("02cd")).rejects.toMatchObject({
      code: "notConnected"
    });
    expect(fake.lightningAddresses.size).toBe(1);
    await expect(deleteWalletLightningAddress("02ab")).resolves.toBe(true);
    expect(fake.lightningAddresses.size).toBe(0);
  });

  it("reads the deposits not credited yet, as the native build does", async () => {
    const { connectWallet, listPendingDeposits, fake } = load();
    await expect(listPendingDeposits()).rejects.toMatchObject({ code: "notConnected" });
    await connectWallet(seed);
    const TX = "AB".repeat(32);
    const deposit = (over: Record<string, unknown> = {}) => ({
      txid: TX,
      vout: 0,
      amountSats: 1500,
      isMature: true,
      ...over
    });
    fake.fakeWallet.unclaimedDeposits = [
      deposit({
        claimError: {
          type: "maxDepositClaimFeeExceeded",
          tx: TX,
          vout: 0,
          requiredFeeSats: 450,
          maxFeeSats: 300
        }
      }),
      deposit({ vout: 1, isMature: false, claimError: { type: "generic", message: "down" } }),
      deposit({ vout: 2, instantClaimStatus: { type: "claimed" } }),
      deposit({ vout: 3, refundTxId: "cd".repeat(32) }),
      // Past Number's exact range: never rounded (hard rule 3).
      deposit({ vout: 4, amountSats: 2 ** 53 }),
      deposit({ vout: 5, txid: "ab" }),
      // Refused within 300 sats (under the 99 of an older app): to be credited. Then at a price
      // above its value or out of shape: waiting all the same, its price not told.
      ...[150, 300, 1501, 150.5, 2 ** 53, "450"].map((requiredFeeSats, i) =>
        deposit({
          vout: 6 + i,
          claimError: {
            type: "maxDepositClaimFeeExceeded",
            tx: TX,
            vout: 6 + i,
            requiredFeeSats,
            maxFeeSats: 300
          }
        })
      ),
      // Not mature: only a claim ahead of maturity was refused, it waits for no lower price.
      deposit({
        vout: 12,
        isMature: false,
        claimError: {
          type: "maxDepositClaimFeeExceeded",
          tx: TX,
          vout: 12,
          requiredFeeSats: 450,
          maxFeeSats: 300
        }
      }),
      // Too small to claim at maturity at the current fees: waits for lower ones, its price not
      // told. Not mature, as a refused early claim: claimed at maturity.
      deposit({ vout: 13, claimError: { type: "depositTooSmall", tx: TX, vout: 13 } }),
      deposit({
        vout: 14,
        isMature: false,
        claimError: { type: "depositTooSmall", tx: TX, vout: 14 }
      })
    ];
    const credited = (vout: number) => ({
      txid: TX.toLowerCase(),
      vout,
      amountSats: 1500n,
      mature: true,
      waitsForFees: false
    });
    await expect(listPendingDeposits()).resolves.toEqual([
      { ...credited(0), waitsForFees: true, claimFeeSats: 450n },
      { ...credited(1), mature: false },
      ...[6, 7].map(credited),
      ...[8, 9, 10, 11].map((vout) => ({ ...credited(vout), waitsForFees: true })),
      { ...credited(12), mature: false },
      { ...credited(13), waitsForFees: true },
      { ...credited(14), mature: false }
    ]);
  });

  it("asks the wallet for a new deposit address each time", async () => {
    const { connectWallet, newDepositAddress, fake } = load();
    await connectWallet(seed);
    const wallet = (await fake.connect.mock.results[0].value) as { receivePayment: jest.Mock };
    const before = fake.depositAddresses.handedOut;

    await expect(newDepositAddress("02ab")).resolves.toBe(taprootAddress(before + 1));
    expect(wallet.receivePayment).toHaveBeenCalledWith({
      paymentMethod: { type: "bitcoinAddress", newAddress: true }
    });
    await expect(newDepositAddress("02cd")).rejects.toMatchObject({ code: "notConnected" });
    wallet.receivePayment.mockResolvedValueOnce({ paymentRequest: "not an address", fee: 0n });
    await expect(newDepositAddress("02ab")).rejects.toMatchObject({ code: "requestFailed" });
  });

  it("refuses to connect on mainnet without an API key", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const { connectWallet, fake } = load();

    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "notConfigured" });
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("keeps one wallet at a time, until it is disconnected", async () => {
    const { connectWallet, disconnectWallet, fake } = load();

    await connectWallet(seed);
    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "alreadyConnected" });
    await disconnectWallet();
    await expect(connectWallet(seed)).resolves.toBeUndefined();
    expect(fake.connect).toHaveBeenCalledTimes(2);
  });

  it("frees the SDK object once disconnected: it holds the wallet's keys", async () => {
    const { connectWallet, disconnectWallet, getWalletId, isWalletConnected, fake } = load();
    await connectWallet(seed);
    expect(isWalletConnected()).toBe(true);
    const sdk = (await fake.connect.mock.results[0].value) as { free: jest.Mock };

    await disconnectWallet();

    expect(isWalletConnected()).toBe(false);
    expect(sdk.free).toHaveBeenCalledTimes(1);
    expect(sdk.free.mock.results[0].type).toBe("return");
    await expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
  });

  it("frees the SDK object only once no call borrows it", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress, fake } = load();
    await connectWallet(seed);
    const sdk = (await fake.connect.mock.results[0].value) as {
      call: <T>(implementation: () => Promise<T>) => () => Promise<T>;
      free: jest.Mock;
      getLightningAddress: jest.Mock;
    };
    let answer!: (value: { lightningAddress: string }) => void;
    sdk.getLightningAddress.mockImplementationOnce(
      sdk.call(() => new Promise<{ lightningAddress: string }>((resolve) => (answer = resolve)))
    );

    const address = getWalletLightningAddress("02ab", "Merchant 02AB");
    await waitForCall(sdk.getLightningAddress);
    await disconnectWallet();
    // The web build would refuse it, and then never free the object.
    expect(sdk.free).not.toHaveBeenCalled();

    answer({ lightningAddress: "sattleme02ab@breez.tips" });
    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    expect(sdk.free).toHaveBeenCalledTimes(1);
    expect(sdk.free.mock.results[0].type).toBe("return");
  });

  it("reports a web build that could not load as a failed connection", async () => {
    const { connectWallet } = load({ loadError: new Error("Failed to fetch") });

    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "connectFailed" });
  });
});
