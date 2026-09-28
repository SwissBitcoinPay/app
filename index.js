import "react-native-get-random-values";
// Hermes ships TextEncoder but not TextDecoder. bitcoinjs-lib, bip174, ecpair
// and varuint-bitcoin depend on uint8array-tools, whose browser build (the one
// Metro resolves) calls `new TextDecoder()` when the module loads, so the
// polyfill must be installed before any of them is required.
import "@bacons/text-decoder/install";
import "node-libs-react-native/globals.js";
import { AppRegistry, LogBox } from "react-native";
import Root from "./src/Root";
import { name as appName } from "./app.json";

if (process.env.NODE_ENV === "production") {
  LogBox.ignoreAllLogs();
} else {
  LogBox.ignoreLogs(["Warning: Failed prop type: Invalid props.style key"]);
}

AppRegistry.registerComponent(appName, () => Root);
