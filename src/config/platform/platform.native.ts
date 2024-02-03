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
import DeviceInfo from "react-native-device-info";
import { getLocale } from "@utils";

const getIsNfcSupported = async () => await NfcManager.isSupported();

const { height: initialWindowHeight, width: initialWindowWidth } =
  Dimensions.get("window");

const isTablet = DeviceInfo.isTablet();

export const platform = {
  isWeb: false,
  isNative: true,
  isAndroid,
  isIos,
  isDesktop: false,
  isMobile,
  model: DeviceInfo.getModel(),
  maxContentWidth: 520,
  isTablet,
  isIphoneX,
  getIsNfcSupported,
  initialWindowWidth,
  initialWindowHeight,
  bottomSafeAreaHeight: 0,
  deviceName: DeviceInfo.getDeviceNameSync(),
  deviceLocale: getLocale(),
  isPrinterSupported: false
};
