import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getDeviceLocale } from "@/lib/locale/device";

import { FALLBACK_LANGUAGE, LANGUAGES, toLanguage, type Language } from "./languages";
import de from "./locales/de";
import deCH from "./locales/de-CH";
import en from "./locales/en";
import es from "./locales/es";
import fi from "./locales/fi";
import fr from "./locales/fr";
import it from "./locales/it";
import pt from "./locales/pt";

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
  de: { translation: de },
  "de-CH": { translation: deCH },
  it: { translation: it },
  es: { translation: es },
  pt: { translation: pt },
  fi: { translation: fi }
} as const satisfies Record<Language, unknown>;

/** Initialised synchronously (bundled resources): the first render is already translated. */
// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented API
void i18n.use(initReactI18next).init({
  resources,
  // The tag, not only the language: its region picks German's variant ("de-CH").
  lng: toLanguage(getDeviceLocale().languageTag),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  // React escapes rendered strings already.
  interpolation: { escapeValue: false }
});

export default i18n;
