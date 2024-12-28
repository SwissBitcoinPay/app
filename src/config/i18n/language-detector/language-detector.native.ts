import { LanguageDetectorModule } from "i18next";
import { getLocale } from "@utils";

const LanguageDetector: LanguageDetectorModule = {
  type: "languageDetector",
  init: () => {},
  detect: () => {
    const locale = getLocale();
    return locale.split("_")[0];
  },
  cacheUserLanguage: () => {}
};

export { LanguageDetector };
