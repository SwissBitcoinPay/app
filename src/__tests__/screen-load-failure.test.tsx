import "@/i18n";

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { isScreenLoadFailure, ScreenLoadFailure } from "@/features/navigation/ScreenLoadFailure";
import { safeErrorCopy } from "@/lib/log/safe-error";

/** expo's error for a script of the web app that could not be fetched (fetchThenEval.web.ts). */
class AsyncRequireError extends Error {
  readonly name = "AsyncRequireError";
}

const retry = async () => undefined;

/** Runs `run` as on `os`, the page's `location` given. */
async function on(os: typeof Platform.OS, run: (reload: jest.Mock) => Promise<void>) {
  const platform = Platform.OS;
  const saved = Object.getOwnPropertyDescriptor(globalThis, "location");
  const reload = jest.fn();
  Platform.OS = os;
  Object.defineProperty(globalThis, "location", { value: { reload }, configurable: true });
  try {
    await run(reload);
  } finally {
    Platform.OS = platform;
    if (saved) Object.defineProperty(globalThis, "location", saved);
    else delete (globalThis as { location?: unknown }).location;
  }
}

describe("a screen of the web app whose code could not be fetched", () => {
  it("says so and reloads the page, never a blank page", () =>
    on("web", async (reload) => {
      await render(
        <ScreenLoadFailure error={new AsyncRequireError("Loading module failed")} retry={retry} />
      );

      expect(screen.getByText("Screen not loaded")).toBeTruthy();
      fireEvent.press(screen.getByTestId("screen-load-failure-reload"));
      expect(reload).toHaveBeenCalledTimes(1);
    }));

  it("is known in the safe copy a release build throws again (LogRenderErrors)", () => {
    expect(isScreenLoadFailure(safeErrorCopy(new AsyncRequireError("Loading module failed")))).toBe(
      true
    );
    expect(isScreenLoadFailure(new Error("Loading module failed"))).toBe(false);
    expect(isScreenLoadFailure("AsyncRequireError")).toBe(false);
  });

  it("lets any other error stop the app as before, and every error on the apps", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const other = new TypeError("Cannot read properties of undefined");
    await on("web", async () => {
      await expect(render(<ScreenLoadFailure error={other} retry={retry} />)).rejects.toBe(other);
    });
    const unfetched = new AsyncRequireError("Loading module failed");
    await on("ios", async () => {
      await expect(render(<ScreenLoadFailure error={unfetched} retry={retry} />)).rejects.toBe(
        unfetched
      );
    });
  });

  it("is the root layout's error boundary", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the route module itself
    const layout = require("@/app/_layout") as { ErrorBoundary?: unknown };
    expect(layout.ErrorBoundary).toBe(ScreenLoadFailure);
  });
});
