import { Component, type ReactNode } from "react";

import { logUncaught } from "@/lib/log/log";
import { safeErrorCopy } from "@/lib/log/safe-error";
import { reportUncaught } from "@/lib/observe/observe";

/*
 * An error while rendering, in the app's journal (src/lib/log/) and told to Expo Observe
 * (src/lib/observe/): React Native 0.88 reports it to its native exception manager itself
 * (ErrorHandlers.js, onUncaughtError), never through the global handler both watch (crashes.ts).
 * Caught here only to be noted, then thrown again: the app stops as it would have without it (no
 * screen of its own: a crash stays a crash). In a release build, what is thrown again is a safe
 * copy (safe-error.ts): React Native's report of the crash leaves the device.
 */

type State = { caught: false } | { caught: true; error: unknown; noted: boolean };

export class LogRenderErrors extends Component<{ children: ReactNode }, State> {
  state: State = { caught: false };

  static getDerivedStateFromError(error: unknown): State {
    return { caught: true, error, noted: false };
  }

  componentDidCatch(error: unknown): void {
    logUncaught("The app stopped on an error while rendering", error);
    reportUncaught(error);
    this.setState({ caught: true, error: __DEV__ ? error : safeErrorCopy(error), noted: true });
  }

  render(): ReactNode {
    if (!this.state.caught) return this.props.children;
    // Noted: thrown again, to React Native's own handling of an uncaught error.
    if (this.state.noted) throw this.state.error;
    return null;
  }
}
