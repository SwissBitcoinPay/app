// The web app's barcode reader (barcode-engine.web.ts): ZXing's
// WebAssembly comes from the app's own asset, never from jsDelivr (the package's default).
const mockPrepare = jest.fn();
const mockPurge = jest.fn();
// The package and the .wasm's URL (Metro gives the .wasm to the web bundle as its URL,
// metro.config.js `assetExts`), as barcode-reader-files.web.ts loads them.
jest.mock("@/features/catalog/barcode-reader-files.web", () => ({
  loadBarcodeReaderFiles: async () => ({
    detector: {
      prepareZXingModule: (...args: unknown[]) => mockPrepare(...args),
      purgeZXingModule: () => mockPurge()
    },
    wasmUrl: "/assets/zxing_reader.wasm"
  })
}));

type Engine = typeof import("@/features/catalog/barcode-engine.web");
type Overrides = { locateFile: (path: string, prefix: string) => string };

/** The module afresh: it keeps the reader it made for the page's life. */
function freshEngine(): Engine {
  let engine: Engine | undefined;
  jest.isolateModules(() => {
    engine = jest.requireActual<Engine>("@/features/catalog/barcode-engine.web");
  });
  return engine!;
}

const global = globalThis as { BarcodeDetector?: unknown };

afterEach(() => {
  delete global.BarcodeDetector;
  mockPrepare.mockReset();
});

describe("the web app's barcode reader", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("loads ZXing's WebAssembly from the app's own asset, never from jsDelivr", async () => {
    mockPrepare.mockResolvedValue({});
    const engine = freshEngine();
    expect(engine.isBarcodeEngineReady()).toBe(false);
    await engine.prepareBarcodeEngine();
    expect(engine.isBarcodeEngineReady()).toBe(true);

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    const [options] = mockPrepare.mock.calls[0] as [
      { overrides: Overrides; fireImmediately: boolean }
    ];
    // Made at once, before any camera reads: expo-camera's detector then finds it ready.
    expect(options.fireImmediately).toBe(true);
    expect(
      options.overrides.locateFile("zxing_reader.wasm", "https://fastly.jsdelivr.net/x/")
    ).toBe("/assets/zxing_reader.wasm");
    // Anything else stays where the module looks for it.
    expect(options.overrides.locateFile("other.data", "/base/")).toBe("/base/other.data");

    // Once per page.
    await engine.prepareBarcodeEngine();
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed load (offline) and loads again on the next try", async () => {
    mockPrepare.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({});
    const engine = freshEngine();
    await expect(engine.prepareBarcodeEngine()).rejects.toThrow("Failed to fetch");
    // The module made with the failed load is dropped: never reused by expo-camera's detector.
    expect(mockPurge).toHaveBeenCalledTimes(1);
    expect(engine.isBarcodeEngineReady()).toBe(false);

    await engine.prepareBarcodeEngine();
    expect(mockPrepare).toHaveBeenCalledTimes(2);
    expect(engine.isBarcodeEngineReady()).toBe(true);
  });

  it("loads nothing where the browser reads barcodes itself (Chrome on Android)", async () => {
    global.BarcodeDetector = class {};
    const engine = freshEngine();
    expect(engine.isBarcodeEngineReady()).toBe(true);
    await engine.prepareBarcodeEngine();
    expect(mockPrepare).not.toHaveBeenCalled();
  });
});
