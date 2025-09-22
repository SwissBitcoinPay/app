import { AppRegistry } from "react-native";
import Root from "./Root";
import "./index.css";

AppRegistry.registerComponent("App", () => Root);

AppRegistry.runApplication("App", {
  initialProps: {},
  rootTag: document.getElementById("root")
});
