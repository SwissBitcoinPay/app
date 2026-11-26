import { engineRuntimeHost, type EngineRuntimeHost } from "./host";
import { installEngineRuntime } from "./runtime";

/*
 * Installs the engine's runtime (runtime/index.ts) as the bundle starts, before the modules that
 * use it run: the entry imports this first, after the polyfills. A host without the runtime (the
 * extension's probe of the app's own code, which needs none) gets none: what would use it throws
 * there, as it is not defined.
 */

let host: EngineRuntimeHost | null = null;
try {
  host = engineRuntimeHost();
} catch {
  // No runtime: see above.
}
if (host) installEngineRuntime(host);
