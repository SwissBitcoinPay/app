import i18n, { LanguageDetectorModule } from "i18next";
import { initReactI18next } from "react-i18next";
import { i18nConfig } from "./i18n-config";
import { getLocale } from "@utils";

const RNLanguageDetector: LanguageDetectorModule = {
  type: "languageDetector",
  init: () => {},
  detect: () => {
    const locale = getLocale();
    return locale.split("_")[0];
  },
  cacheUserLanguage: () => {}
};

void i18n.use(RNLanguageDetector).use(initReactI18next).init(i18nConfig);

export default i18n;
