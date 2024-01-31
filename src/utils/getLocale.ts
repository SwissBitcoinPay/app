import { Settings, I18nManager, Platform } from "react-native";

export const getLocale = () => {
  let currentLocale = "en";

  if (Platform.OS === "ios") {
    const settings = Settings.get("AppleLocale");
    const locale = settings || settings?.[0];
    if (locale) currentLocale = locale;
  } else if (Platform.OS === "android") {
    const locale = I18nManager.getConstants().localeIdentifier;
    if (locale) currentLocale = locale;
  } else if (Platform.OS === "web") {
    const locale = navigator?.languages?.[0];
    if (locale) currentLocale = locale;
  }

  return currentLocale;
};
