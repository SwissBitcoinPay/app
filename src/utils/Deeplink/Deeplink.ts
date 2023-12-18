import { EmitterSubscription } from "react-native";
import { Deeplink as NativeDeeplink } from "./Deeplink.native";

export const Deeplink: Pick<
  typeof NativeDeeplink,
  "addEventListener" | "getInitialURL"
> = {
  addEventListener: (_key, _cb) => {
    return {} as EmitterSubscription;
  },
  getInitialURL: async () => {
    return new Promise(() => null);
  }
};
