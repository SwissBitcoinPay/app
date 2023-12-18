// @ts-nocheck
import { Dimensions, Platform, StatusBar, NativeModules } from "react-native";
import {
  isAndroid,
  isIos,
  isPhone as isMobile,
  isIphoneX
} from "react-native-device-detection";
import NfcManager from "react-native-nfc-manager";
import DeviceInfo from "react-native-device-info";

const getIsNfcSupported = async () => await NfcManager.isSupported();

const X_WIDTH = 375;
const X_HEIGHT = 812;

const XSMAX_WIDTH = 414;
const XSMAX_HEIGHT = 896;

const { height: initialWindowHeight, width: initialWindowWidth } =
  Dimensions.get("window");

const isIPhoneX = () =>
  Platform.OS === "ios" && !Platform.isPad && !Platform.isTV
    ? (width === X_WIDTH && height === X_HEIGHT) ||
      (width === XSMAX_WIDTH && height === XSMAX_HEIGHT)
    : false;

const statusBarHeight = Platform.select({
  ios: isIPhoneX() ? 44 : 20,
  android: StatusBar.currentHeight,
  default: 0
});

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
  statusBarHeight,
  bottomSafeAreaHeight: 0,
  deviceName: DeviceInfo.getDeviceNameSync(),
  deviceLocale:
    Platform.OS === "ios"
      ? NativeModules.SettingsManager.settings.AppleLocale ||
        NativeModules.SettingsManager.settings.AppleLanguages[0]
      : NativeModules.I18nManager?.localeIdentifier,
  isPrinterSupported: false
};
