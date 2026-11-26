import { render, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { LEFT_OUT_MESSAGE } from "@/lib/log/safe-error";
import { OBSERVE_CHOICE_KEY, serializeObserveChoice } from "@/lib/observe/choice-format";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as ObserveFake from "../../jest/expo-observe";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

type ObserveModule = typeof import("@/lib/observe/observe");
type CrashesModule = typeof import("@/lib/log/crashes");
type LogModule = typeof import("@/lib/log/log");
type WipeModule = typeof import("@/features/settings/device-wipe");
type Handler = (error: unknown, isFatal: boolean) => void;

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const fake = jest.requireMock<typeof ObserveFake>("expo-observe");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

/** What Observe is told: nothing that could hold a value, and whether it sends (`send`). */
function told(environment: string, send: boolean) {
  return {
    environment,
    dispatchingEnabled: send,
    errorHandlingEnabled: send,
    networkTraces: false
  };
}

// A value of the app that must never leave the device (clearly fake, as app-log.test.tsx's).
const INVOICE =
  "lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs";

/** Everything of an error that Observe and React Native's report read (name, message, stack). */
function sent(error: unknown): string {
  const { name, message, stack } = error as Error;
  return [name, message, stack].join("\n");
}

/**
 * React Native's global handler, as the app starts: its own (`reactNative`), then what installs
 * over it, the handler errors reach first (`current`).
 */
async function withErrorUtils(
  run: (reactNative: jest.Mock, current: () => Handler) => Promise<void>
): Promise<void> {
  const reactNative = jest.fn();
  let handler: Handler = reactNative;
  const saved = Object.getOwnPropertyDescriptor(globalThis, "ErrorUtils");
  Object.defineProperty(globalThis, "ErrorUtils", {
    value: {
      getGlobalHandler: () => handler,
      setGlobalHandler: (next: Handler) => (handler = next)
    },
    configurable: true
  });
  try {
    await run(reactNative, () => handler);
  } finally {
    if (saved) Object.defineProperty(globalThis, "ErrorUtils", saved);
    else delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
  }
}

/** A release build: `__DEV__` false, as the app's code reads it when it runs, until `run` ends. */
async function inRelease<T>(run: () => T | Promise<T>): Promise<T> {
  const dev = Object.getOwnPropertyDescriptor(globalThis, "__DEV__");
  Object.defineProperty(globalThis, "__DEV__", { value: false, configurable: true });
  try {
    return await run();
  } finally {
    if (dev) Object.defineProperty(globalThis, "__DEV__", dev);
  }
}

/** The app's modules loaded afresh, as when it starts (expo-observe's fake is the file's). */
function load(): {
  observe: ObserveModule;
  crashes: CrashesModule;
  log: LogModule;
  wipe: WipeModule;
} {
  let modules: ReturnType<typeof load> | undefined;
  jest.isolateModules(() => {
    modules = {
      observe: jest.requireActual<ObserveModule>("@/lib/observe/observe"),
      crashes: jest.requireActual<CrashesModule>("@/lib/log/crashes"),
      log: jest.requireActual<LogModule>("@/lib/log/log"),
      wipe: jest.requireActual<WipeModule>("@/features/settings/device-wipe")
    };
  });
  return modules!;
}

/** Starts Observe as the app does, then waits for this device's choice to be read and applied. */
async function start(observe: ObserveModule, variant: string): Promise<void> {
  observe.startObserve(variant);
  await waitFor(() => expect(observe.observeChoice()).not.toBeNull());
}

/** This device's saved choice ("Send crash reports"). */
function saveChoice(send: boolean): void {
  secureStore.items.set(OBSERVE_CHOICE_KEY, serializeObserveChoice(send));
}

// The journal's file: each test's modules start on an empty one.
beforeEach(() => fileSystem.resetFileSystem());

describe("Expo Observe", () => {
  it("starts once, with the app's variant, sending nothing of what could hold a value", async () => {
    const { observe } = load();
    observe.startObserve("staging");
    observe.startObserve("staging");
    // Nothing sent until this device's choice is read: the library sends by default.
    expect(fake.observe.configured).toEqual([told("staging", false)]);

    await start(observe, "staging");
    expect(fake.observe.configured).toEqual([told("staging", false), told("staging", true)]);
    // No navigation integration: Expo Router's params carry a payment link's fragment.
    for (const config of fake.observe.configured) expect(config).not.toHaveProperty("integrations");
  });

  it("sends by default in staging only, until the device's holder chooses", async () => {
    for (const [variant, send] of [
      // Production: off until its holder turns it on, the most protective setting by default.
      ["production", false],
      ["staging", true],
      ["unknown", false]
    ] as const) {
      fake.resetObserve();
      const { observe } = load();
      await start(observe, variant);
      expect(observe.observeChoice()).toBe(send);
      expect(fake.observe.configured.at(-1)).toEqual(told(variant, send));
    }

    // The holder's choice stands over the default, either way.
    for (const [variant, send] of [
      ["production", true],
      ["staging", false],
      ["unknown", true]
    ] as const) {
      fake.resetObserve();
      saveChoice(send);
      const { observe } = load();
      await start(observe, variant);
      expect(observe.observeChoice()).toBe(send);
      expect(fake.observe.configured.at(-1)).toEqual(told(variant, send));
    }

    // Damaged, or a newer app's: the default, never the record.
    for (const [variant, record, send] of [
      ["staging", '{"version":2,"send":false}', true],
      ["production", '{"version":2,"send":true}', false]
    ] as const) {
      fake.resetObserve();
      secureStore.items.set(OBSERVE_CHOICE_KEY, record);
      const { observe } = load();
      await start(observe, variant);
      expect(observe.observeChoice()).toBe(send);
      expect(fake.observe.configured.at(-1)).toEqual(told(variant, send));
    }
  });

  it("keeps its name and format: installed apps read them", () => {
    expect(OBSERVE_CHOICE_KEY).toBe("observe-reports");
    expect(serializeObserveChoice(true)).toBe('{"version":1,"send":true}');
  });

  it("applies the holder's choice at once, and tells who follows it", async () => {
    const { observe } = load();
    await start(observe, "production");
    expect(fake.observe.configured.at(-1)).toEqual(told("production", false));
    const heard = jest.fn();
    const stop = observe.followObserveChoice(heard);

    await observe.saveObserveChoice(true);
    expect(observe.observeChoice()).toBe(true);
    expect(fake.observe.configured.at(-1)).toEqual(told("production", true));
    expect(secureStore.items.get(OBSERVE_CHOICE_KEY)).toBe(serializeObserveChoice(true));
    await observe.saveObserveChoice(false);
    expect(fake.observe.configured.at(-1)).toEqual(told("production", false));
    expect(secureStore.items.get(OBSERVE_CHOICE_KEY)).toBe(serializeObserveChoice(false));
    expect(heard).toHaveBeenCalledTimes(2);

    // Not saved: nothing changes.
    stop();
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    const configured = fake.observe.configured.length;
    await expect(observe.saveObserveChoice(true)).rejects.toThrow("Keychain unavailable");
    expect(observe.observeChoice()).toBe(false);
    expect(fake.observe.configured).toHaveLength(configured);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('goes with "Log out", the variant\'s default applying again at once', async () => {
    for (const [variant, saved] of [
      ["production", true],
      ["staging", false]
    ] as const) {
      fake.resetObserve();
      saveChoice(saved);
      const { observe, wipe } = load();
      await start(observe, variant);
      expect(observe.observeChoice()).toBe(saved);

      await wipe.wipeDevice();
      expect(secureStore.items.has(OBSERVE_CHOICE_KEY)).toBe(false);
      // The default is the other way in each variant: off in production, on in staging.
      expect(observe.observeChoice()).toBe(!saved);
      expect(fake.observe.configured.at(-1)).toEqual(told(variant, !saved));
    }
  });

  it("lets the app go on without its native module, and says so in the journal", () => {
    const { observe, log } = load();
    fake.missNativeModule();

    expect(() => observe.startObserve("production")).not.toThrow();
    observe.markObservedFirstRender();
    observe.reportUncaught(new Error("No answer in time"));
    expect(fake.observe).toMatchObject({ configured: [], firstRenders: 0, reported: [] });
    expect(log.readLog().entries).toEqual([
      expect.objectContaining({ level: "warning", event: "Starting Expo Observe failed" })
    ]);
  });

  it("marks the first render once started only", async () => {
    const { observe } = load();
    observe.markObservedFirstRender();
    expect(fake.observe.firstRenders).toBe(0);

    await start(observe, "production");
    observe.markObservedFirstRender();
    expect(fake.observe.firstRenders).toBe(1);
  });

  it("hears and reports nothing while it does not send", () =>
    withErrorUtils(async (reactNative, current) => {
      // Its holder turned it off.
      saveChoice(false);
      const { observe, crashes } = load();
      await start(observe, "production");
      crashes.logUncaughtErrors();

      await inRelease(() => current()(new Error("Rendering failed"), true));
      observe.reportUncaught(new Error("No answer in time"));

      expect(fake.observe.heard).toEqual([]);
      expect(fake.observe.reported).toEqual([]);
      // React Native's own report of the crash still comes.
      expect(reactNative).toHaveBeenCalledTimes(1);
    }));

  it("hears an uncaught error as a safe copy, which React Native's report gets too, in a release build", () =>
    withErrorUtils(async (reactNative, current) => {
      const { observe, crashes, log } = load();
      saveChoice(true);
      // As the app starts (src/app/_layout.tsx): Observe first, then the journal's handler over it.
      await start(observe, "production");
      crashes.logUncaughtErrors();
      const crash = new TypeError(`Cannot pay ${INVOICE}`);

      await inRelease(() => current()(crash, true));

      expect(fake.observe.heard).toHaveLength(1);
      const heard = fake.observe.heard[0]!;
      expect(heard.isFatal).toBe(true);
      expect(heard.error).toMatchObject({ name: "TypeError", message: LEFT_OUT_MESSAGE });
      expect(sent(heard.error)).not.toContain(INVOICE);
      // React Native's own report of the crash (Android's JavascriptException), after Observe.
      expect(reactNative).toHaveBeenCalledWith(heard.error, true);
      // The journal noted it first, as it always does.
      expect(log.readLog().entries.at(-1)).toMatchObject({
        event: "The app stopped on an uncaught error",
        error: { kind: "TypeError", message: null }
      });
    }));

  it("hands the error itself down in development, for React Native's red box", () =>
    withErrorUtils(async (reactNative, current) => {
      const { observe, crashes } = load();
      await start(observe, "staging");
      crashes.logUncaughtErrors();
      const crash = new Error("Rendering failed");

      current()(crash, false);

      expect(fake.observe.heard).toEqual([{ error: crash, isFatal: false }]);
      expect(reactNative).toHaveBeenCalledWith(crash, false);
    }));

  it("is started by the app under the journal's handler of uncaught errors", () =>
    withErrorUtils(async (reactNative, current) => {
      saveChoice(true);
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded afresh, as the app starts
        require("@/app/_layout");
      });
      await waitFor(() =>
        expect(fake.observe.configured.at(-1)).toMatchObject({
          dispatchingEnabled: true,
          errorHandlingEnabled: true,
          networkTraces: false
        })
      );

      await inRelease(() => current()(new Error(`Cannot pay ${INVOICE}`), true));

      // Observe heard what the journal's handler, over it, handed down: the safe copy.
      expect(fake.observe.heard).toHaveLength(1);
      expect(sent(fake.observe.heard[0]!.error)).not.toContain(INVOICE);
      expect(reactNative).toHaveBeenCalledWith(fake.observe.heard[0]!.error, true);
    }));

  it("reports what its handler does not hear as a safe copy, each error once a run", async () => {
    const { observe } = load();
    observe.reportUncaught(new Error("Before the start"));
    expect(fake.observe.reported).toEqual([]);

    await start(observe, "staging");
    const error = new Error(`Invalid invoice ${INVOICE}`);
    observe.reportUncaught(error);
    observe.reportUncaught(error);
    observe.reportUncaught(new RangeError("Out of range"));

    expect(fake.observe.reported).toHaveLength(2);
    expect(fake.observe.reported[0]).toMatchObject({ name: "Error", message: LEFT_OUT_MESSAGE });
    expect(sent(fake.observe.reported[0])).not.toContain(INVOICE);
    expect(fake.observe.reported[1]).toMatchObject({ name: "RangeError", message: "Out of range" });
  });

  it("reports at most a bounded number of errors in a run", async () => {
    const { observe } = load();
    await start(observe, "staging");
    for (let n = 0; n < observe.MAX_REPORTS_PER_RUN + 10; n++) {
      observe.reportUncaught(Object.assign(new Error("Failed"), { code: `code${n % 1000}` }));
    }

    expect(fake.observe.reported).toHaveLength(observe.MAX_REPORTS_PER_RUN);
  });

  it("reports an error while rendering, then lets React Native report its safe copy", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    let LogRenderErrors: typeof import("@/components/LogRenderErrors").LogRenderErrors | undefined;
    let observe: ObserveModule | undefined;
    jest.isolateModules(() => {
      observe = jest.requireActual<ObserveModule>("@/lib/observe/observe");
      ({ LogRenderErrors } = jest.requireActual<typeof import("@/components/LogRenderErrors")>(
        "@/components/LogRenderErrors"
      ));
    });
    await start(observe!, "staging");
    function Broken(): ReactElement {
      throw new TypeError(`Unknown invoice ${INVOICE}`);
    }
    const Boundary = LogRenderErrors!;

    // What stops the app, as React Native reports it: the safe copy.
    const thrown = await inRelease(() =>
      render(
        <Boundary>
          <Broken />
        </Boundary>
      )
    ).catch((error: unknown) => error);

    expect(thrown).toMatchObject({ name: "TypeError", message: LEFT_OUT_MESSAGE });
    expect(sent(thrown)).not.toContain(INVOICE);
    expect(fake.observe.reported).toHaveLength(1);
    expect(sent(fake.observe.reported[0])).not.toContain(INVOICE);
  });

  it("reports a promise rejected with nothing to catch it, in a release build", async () => {
    let options: { onUnhandled(id: number, rejection: unknown): void } | null = null;
    const saved = Object.getOwnPropertyDescriptor(globalThis, "HermesInternal");
    Object.defineProperty(globalThis, "HermesInternal", {
      value: { enablePromiseRejectionTracker: (given: typeof options) => (options = given) },
      configurable: true
    });
    try {
      const { observe, crashes } = load();
      await start(observe, "staging");
      await inRelease(() => crashes.logUnhandledRejections());
      options!.onUnhandled(1, new Error(`No route to ${INVOICE}`));

      expect(fake.observe.reported).toHaveLength(1);
      expect(fake.observe.reported[0]).toMatchObject({ message: LEFT_OUT_MESSAGE });
      expect(sent(fake.observe.reported[0])).not.toContain(INVOICE);
    } finally {
      if (saved) Object.defineProperty(globalThis, "HermesInternal", saved);
      else delete (globalThis as { HermesInternal?: unknown }).HermesInternal;
    }
  });
});
