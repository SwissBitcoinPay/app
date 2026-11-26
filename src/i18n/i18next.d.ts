import "i18next";

import type fr from "./locales/fr";

/** Type-checks translation keys against the French source. */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof fr };
  }
}
