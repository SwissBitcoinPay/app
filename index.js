import "react-native-get-random-values";
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
