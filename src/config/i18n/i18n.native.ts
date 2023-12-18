import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import RNLanguageDetector from "@os-team/i18next-react-native-language-detector";
import { i18nConfig } from "./i18n-config";

void i18n.use(RNLanguageDetector).use(initReactI18next).init(i18nConfig);

export default i18n;
