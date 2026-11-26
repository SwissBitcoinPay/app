import { secureRandomBytes } from "@/lib/random";

// jest.setup.ts backs expo-crypto's getRandomValues with Node's crypto.
describe("secureRandomBytes", () => {
  afterEach(() => jest.restoreAllMocks());

  it("draws fresh bytes from the platform's secure source", () => {
    const source = jest.spyOn(globalThis.crypto, "getRandomValues");
    const first = secureRandomBytes(32);
    const second = secureRandomBytes(32);

    expect(first).toHaveLength(32);
    expect(second).not.toEqual(first);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("refuses a source that wrote nothing", () => {
    jest.spyOn(globalThis.crypto, "getRandomValues").mockImplementationOnce((array) => array);

    expect(() => secureRandomBytes(16)).toThrow(/No secure random source/);
  });
});
