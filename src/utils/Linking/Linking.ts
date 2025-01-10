import { Linking as NativeLinking } from "react-native";

export const Linking: Pick<typeof NativeLinking, "openURL" | "canOpenURL"> = {
  openURL: (url: string) => {
    window.location.href = url;
    return new Promise(() => null);
  },
  canOpenURL: (url: string) => true
};
