/*
 * A fake of expo-observe (58.0.15) for Jest (jest.setup.ts): what the app uses of it
 * (src/lib/observe/), as it records it: its configurations, the first renders marked, the errors
 * reported. The library installs its handler of uncaught errors as it is loaded
 * (expo-app-metrics' installErrorHandler), in front of the one React Native's `ErrorUtils` has; the
 * app loads it and configures it at once (startObserve), so here it is installed at the first
 * `configure` with an `ErrorUtils` there (not in Jest's environment, unless a test gives one),
 * once per `ErrorUtils`: what it hears while the last configuration lets it
 * (`errorHandlingEnabled`, true when not said), then the handler it found. `missNativeModule()`:
 * the next start fails, as the library throws without its native module (requireNativeModule).
 * Reset before each test (jest.after-env.ts).
 */

type Handler = (error: unknown, isFatal: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler: () => Handler;
  setGlobalHandler: (handler: Handler) => void;
};

export const observe = {
  configured: [] as Record<string, unknown>[],
  firstRenders: 0,
  reported: [] as unknown[],
  /** What its handler of uncaught errors heard, in order. */
  heard: [] as { error: unknown; isFatal: boolean }[]
};

let missing = false;
let errorHandling = true;
const installedOn = new WeakSet<ErrorUtilsLike>();

function installErrorHandler(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils || installedOn.has(utils)) return;
  installedOn.add(utils);
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    try {
      if (errorHandling) observe.heard.push({ error, isFatal });
    } finally {
      previous(error, isFatal);
    }
  });
}

export const Observe = {
  configure(config: Record<string, unknown>): void {
    if (missing) {
      missing = false;
      throw new Error("Cannot find native module 'ExpoObserve'");
    }
    installErrorHandler();
    errorHandling = config.errorHandlingEnabled !== false;
    observe.configured.push(config);
  },
  markFirstRender(): void {
    observe.firstRenders++;
  },
  reportError(error: unknown): void {
    observe.reported.push(error);
  }
};

export function missNativeModule(): void {
  missing = true;
}

export function resetObserve(): void {
  observe.configured = [];
  observe.firstRenders = 0;
  observe.reported = [];
  observe.heard = [];
  missing = false;
  errorHandling = true;
}
