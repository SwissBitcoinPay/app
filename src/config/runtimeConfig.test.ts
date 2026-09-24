import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockConfigGet = jest.fn<() => Promise<unknown>>();
const mockCurrenciesList = jest.fn<() => Promise<unknown>>();

jest.mock("@types", () => ({
  api: {
    config: { get: () => mockConfigGet() },
    currencies: { list: () => mockCurrenciesList() }
  }
}));

describe("initRuntimeConfig", () => {
  // Reload the module for each test so its singleton cache (_config, _ready)
  // doesn't leak between tests.
  let runtimeConfig: typeof import("./runtimeConfig");

  beforeEach(() => {
    jest.resetModules();
    mockConfigGet.mockReset();
    mockCurrenciesList.mockReset();
    mockCurrenciesList.mockResolvedValue({ currencies: [] });
    runtimeConfig =
      jest.requireActual<typeof import("./runtimeConfig")>("./runtimeConfig");
  });

  it("refetches on the next call after a failure instead of caching the rejection", async () => {
    mockConfigGet.mockRejectedValueOnce(
      new TypeError("Network request failed")
    );

    await expect(runtimeConfig.initRuntimeConfig()).rejects.toThrow(
      "Network request failed"
    );

    mockConfigGet.mockResolvedValueOnce({ environment: "production" });

    await expect(runtimeConfig.initRuntimeConfig()).resolves.toBeUndefined();
    expect(mockConfigGet).toHaveBeenCalledTimes(2);
    expect(runtimeConfig.getEnvironment()).toBe("production");
  });

  it("rejects when a request never settles so it can be retried", async () => {
    jest.useFakeTimers();
    try {
      mockConfigGet.mockReturnValueOnce(new Promise(() => {}));

      const pending = runtimeConfig.initRuntimeConfig(5000);
      jest.advanceTimersByTime(5000);

      await expect(pending).rejects.toThrow("timed out after 5000ms");

      mockConfigGet.mockResolvedValueOnce({ environment: "production" });
      await expect(runtimeConfig.initRuntimeConfig()).resolves.toBeUndefined();
      expect(mockConfigGet).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
