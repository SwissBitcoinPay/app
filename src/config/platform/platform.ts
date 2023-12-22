import { Dimensions } from "react-native";
import {
  isAndroid,
  isIOS as isIos,
  isDesktop,
  isTablet,
  isMobile,
  browserName,
  osName
} from "react-device-detect";

// eslint-disable-next-line @typescript-eslint/require-await
const getIsNfcSupported = async () => "NDEFReader" in window;

const { height: initialWindowHeight, width: initialWindowWidth } =
  Dimensions.get("window");

export const platform = {
  isWeb: true,
  isNative: false,
  isAndroid,
  isIos,
  isDesktop,
  isTablet,
  isMobile,
  model: "",
  maxContentWidth: 660,
  isIphoneX: false,
  getIsNfcSupported,
  initialWindowWidth,
  initialWindowHeight,
  bottomSafeAreaHeight: 0,
  deviceName: `${osName} | ${browserName}`,
  deviceLocale: navigator?.languages?.[0],
  isPrinterSupported: false
};
