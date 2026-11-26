import type * as BreezStatusModule from "../lib/breez/status";

const BREEZ_SDK = "@breeztech/breez-sdk-spark-react-native";

// The mock registered in jest.setup.ts. jest.resetModules() does not remove
// factories registered with jest.doMock(), so tests that override the SDK mock
// must put this one back, or every later test would get their override.
const defaultSdkMock: unknown = jest.requireMock(BREEZ_SDK);

function loadGetBreezStatus(breezNetwork: unknown = "mainnet") {
  // Re-required after jest.resetModules() so each test gets a fresh module graph.
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork } } }
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("../lib/breez/status") as typeof BreezStatusModule).getBreezStatus;
}

describe("getBreezStatus", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  });

  afterEach(() => {
    jest.doMock(BREEZ_SDK, () => defaultSdkMock);
    // Assigning undefined would store the string "undefined": delete instead.
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("reports the SDK as loaded on the network of the build", () => {
    expect(loadGetBreezStatus()()).toEqual({
      available: true,
      network: "Mainnet",
      apiKeyConfigured: true
    });
    expect(loadGetBreezStatus("regtest")()).toMatchObject({ available: true, network: "Regtest" });
  });

  it("reports a missing or blank API key", () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    expect(loadGetBreezStatus()()).toMatchObject({ available: true, apiKeyConfigured: false });

    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "  ";
    expect(loadGetBreezStatus()()).toMatchObject({ available: true, apiKeyConfigured: false });
  });

  it("reports an invalid network in the app config instead of picking one", () => {
    expect(loadGetBreezStatus("signet")()).toEqual({
      available: false,
      reason: expect.stringContaining('Invalid extra.breezNetwork "signet"')
    });
    expect(loadGetBreezStatus(null)()).toMatchObject({ available: false });
  });

  it("reports the SDK as unavailable when the native module fails to load", () => {
    // The package installs the native module at import time: a missing or
    // mismatched native library throws while the module is being required.
    jest.doMock(BREEZ_SDK, () => {
      throw new Error("BreezSdkSparkReactNative could not be found");
    });

    expect(loadGetBreezStatus()()).toEqual({
      available: false,
      reason: "BreezSdkSparkReactNative could not be found"
    });
  });

  it("uses the default SDK mock again after a test overrode it", () => {
    expect(loadGetBreezStatus()()).toMatchObject({ available: true, network: "Mainnet" });
  });
});
