import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { LanguageDetector } from "./language-detector";
import { i18nConfig } from "./i18n-config";

void i18n.use(LanguageDetector).use(initReactI18next).init(i18nConfig);

export default i18n;
