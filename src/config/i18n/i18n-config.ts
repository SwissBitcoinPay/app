import { resources } from "@assets/translations";

export const i18nConfig = {
  compatibilityJSON: "v4" as const,
  resources,
  fallbackLng: "en",
  debug: process.env.NODE_ENV === "development",
  interpolation: {
    escapeValue: false // not needed for react as it escapes by default
  }
};
