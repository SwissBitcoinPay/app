/**
 * Fake of react-native-webview for Jest (a native view): a plain view, whose props tests reach
 * through `shownWebView` to play its page: its load, its errors, the navigations and windows it
 * asks for, its web process ending. `webViewMounts` counts the views mounted, each a new page.
 */
import { useEffect } from "react";
import { View } from "react-native";
import type { WebViewProps } from "react-native-webview";

let shown: WebViewProps | null = null;
let mounts = 0;

export function resetWebView(): void {
  shown = null;
  mounts = 0;
}

/** The props of the WebView shown now. */
export function shownWebView(): WebViewProps {
  if (!shown) throw new Error("No WebView is shown");
  return shown;
}

/** Whether a WebView is shown now. */
export function webViewShown(): boolean {
  return shown !== null;
}

/** How many WebViews were mounted since the test started. */
export function webViewMounts(): number {
  return mounts;
}

export function WebView(props: WebViewProps) {
  useEffect(() => {
    mounts += 1;
    return () => {
      shown = null;
    };
  }, []);
  useEffect(() => {
    shown = props;
  }, [props]);
  return <View testID={props.testID} />;
}

export default WebView;
