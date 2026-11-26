/**
 * The legal documents of sattle.me, published on its site, which the app links to: before the
 * sign-up (the welcome screen) and from the "Settings" of every account (LegalLinks.tsx). The App
 * Store (App Review Guideline 5.1.1(i)) and Google Play (User Data policy) require the privacy
 * policy to be reachable within the app.
 *
 * Pages outside the app (external-link.ts): their host must never be the web app's, every path of
 * which opens in the app itself (app.config.ts: associated domains and App Links).
 */
export const LEGAL_URLS = {
  terms: "https://sattle.me/terms",
  privacy: "https://sattle.me/privacy"
} as const;

export type LegalDocument = keyof typeof LEGAL_URLS;
