import { ImageSourcePropType } from "react-native";

export const PlaceholderPresets: { [key in string]: ImageSourcePropType } = {
  activationQrCode: require("@assets/images/activation-qr-placeholder.png")
};

export type PlaceholderPresetsTypes = (typeof PlaceholderPresets)[number];
