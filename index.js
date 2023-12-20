import "node-libs-react-native/globals.js";
import { AppRegistry, LogBox } from "react-native";
import { Root } from "./src/Root";
import { name as appName } from "./app.json";
import TestFairy from "react-native-testfairy";
import {
  isSslPinningAvailable,
  initializeSslPinning
} from "react-native-ssl-public-key-pinning";

if (process.env.NODE_ENV === "production") {
  TestFairy.begin("SDK-HU2aT39S");
}

if (isSslPinningAvailable()) {
  void initializeSslPinning({
    "api.swiss-bitcoin-pay.ch": {
      includeSubdomains: false,
      publicKeyHashes: [
        "GPC87Im4qy67XPovXRcnZlNRbNNpyuK3EWbzGPy+1+A=",
        "3fLLVjRIWnCqDqIETU2OcnMP7EzmN/Z3Q/jQ8cIaAoc="
      ]
    }
  });
}

LogBox.ignoreLogs(["Warning: Failed prop type: Invalid props.style key"]);

AppRegistry.registerComponent(appName, () => Root);
