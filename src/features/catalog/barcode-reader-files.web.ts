/**
 * The files of the web app's barcode reader, loaded on first use only (barcode-engine.web.ts): the
 * `barcode-detector` package, imported as expo-camera imports it (`import("barcode-detector")`:
 * one module, whose ZXing reader both share), and ZXing's .wasm, an asset of the app's
 * (metro.config.js), as its URL. Apart from the engine: Jest cannot run dynamic imports, its tests
 * replace this module.
 */
export async function loadBarcodeReaderFiles(): Promise<{
  detector: typeof import("barcode-detector");
  wasmUrl: string;
}> {
  const [detector, wasm] = await Promise.all([
    import("barcode-detector"),
    import("zxing-wasm/reader/zxing_reader.wasm")
  ]);
  return { detector, wasmUrl: wasm.default };
}
