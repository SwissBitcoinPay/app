import { Dimensions } from "react-native";
import {
  // @ts-ignore
  isAndroid,
  // @ts-ignore
  isIos,
  // @ts-ignore
  isPhone as isMobile,
  // @ts-ignore
  isIphoneX
} from "react-native-device-detection";
import NfcManager from "react-native-nfc-manager";
import DeviceInfo, { getDeviceSync } from "react-native-device-info";
import { getLocale } from "@utils";

const getIsNfcSupported = async () => await NfcManager.isSupported();

const { height: initialWindowHeight, width: initialWindowWidth } =
  Dimensions.get("window");

const isTablet = DeviceInfo.isTablet();

const device = getDeviceSync();

const model = DeviceInfo.getModel();

const isBitcoinize =
  ["BTC21PRO", "Bitcoinize Machine"].includes(device) ||
  model === "Bitcoinize-BTC21PRO";

export const platform = {
  isWeb: false,
  isNative: true,
  isAndroid,
  isIos,
  isDesktop: false,
  isMobile,
  model,
  maxContentWidth: 520,
  isTablet,
  isIphoneX,
  getIsNfcSupported,
  initialWindowWidth,
  initialWindowHeight,
  bottomSafeAreaHeight: 0,
  deviceName: DeviceInfo.getDeviceNameSync(),
  deviceLocale: getLocale(),
  isBitcoinize,
  isShareAvailable: true,
  springAnimationDelay: 0
};
