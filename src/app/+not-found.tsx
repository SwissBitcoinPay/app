import { Redirect } from "expo-router";

/**
 * An address without a screen (a mistyped or outdated link of the web app, which the apps open too:
 * universal links / App Links of every path): the start, which leads to the point
 * of sale or the welcome screen. Never Expo Router's "Unmatched Route" page.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
