// Files of the Breez SDK web build that its package "exports" do not list, imported by
// web-sdk.ts and resolved by metro.config.js.

declare module "@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm.js" {
  /** wasm-bindgen initialisation of the SDK, from the URL of its .wasm file. */
  export default function initWasm(options: { module_or_path: string }): Promise<unknown>;
}

declare module "@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm_bg.wasm" {
  /** On the web, Metro gives assets that are not images as their URL. */
  const url: string;
  export default url;
}
