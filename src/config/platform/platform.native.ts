import { Dimensions, Platform, NativeModules } from "react-native";
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

const getIsNfcSupported = async () => await NfcManager.isSupported();

const { height: initialWindowHeight, width: initialWindowWidth } =
  Dimensions.get("window");

const isTablet = DeviceInfo.isTablet();

const isLowEndDevice = DeviceInfo.getTotalMemorySync() < 3221225472; // 3 GB

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
  deviceLocale:
    Platform.OS === "ios"
      ? NativeModules.SettingsManager.settings.AppleLocale ||
        NativeModules.SettingsManager.settings.AppleLanguages[0]
      : NativeModules.I18nManager?.localeIdentifier,
  isPrinterSupported: false,
  isLowEndDevice
};
