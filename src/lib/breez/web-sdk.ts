import type * as PasskeyModule from "@breeztech/breez-sdk-spark/passkey-prf-provider";
import type * as BreezWebSdk from "@breeztech/breez-sdk-spark/web";

/** The web build of the Breez SDK and its browser passkey provider, once initialised. */
export type BreezWeb = {
  sdk: typeof BreezWebSdk;
  passkeys: typeof PasskeyModule;
};

let loading: Promise<BreezWeb> | null = null;
let loaded = false;

/**
 * The web build of the Breez SDK (WebAssembly, `@breeztech/breez-sdk-spark`), loaded once, on
 * first use: its .wasm file weighs 12.7 MB. Only imported by the *.web.ts files.
 *
 * The package's own initialisation looks for the .wasm next to its JS (`import.meta.url`), which
 * Metro does not serve: the wasm-bindgen module is initialised first with the asset URL of the
 * .wasm (metro.config.js), then the package entry sets up its IndexedDB storage, its own wasm
 * initialisation being a no-op by then. The synchronous `initSync` is not an option: Chrome
 * refuses to compile a module of more than 8 MB synchronously on the main thread.
 */
export function loadBreezWeb(): Promise<BreezWeb> {
  if (!loading) {
    const attempt = (async () => {
      const [glue, wasm, sdk, passkeys] = await Promise.all([
        import("@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm.js"),
        import("@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm_bg.wasm"),
        import("@breeztech/breez-sdk-spark/web"),
        import("@breeztech/breez-sdk-spark/passkey-prf-provider")
      ]);
      await glue.default({ module_or_path: wasm.default });
      await sdk.default();
      loaded = true;
      return { sdk, passkeys };
    })();
    loading = attempt;
    // A failed load (offline) is retried on the next call.
    attempt.catch(() => {
      if (loading === attempt) loading = null;
    });
  }
  return loading;
}

/** Whether the web build is loaded and initialised. */
export function isBreezWebLoaded(): boolean {
  return loaded;
}
