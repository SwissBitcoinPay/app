import Constants from "expo-constants";

/**
 * Where a payment link opens (src/lib/payment-link/): the web app of the build's variant, whose
 * route `/pay` shows the shared invoice to the payer. Its origin comes from the app config
 * (`extra.webAppOrigin`, app.config.ts), the host of its passkeys' RP ID: staging's is EAS
 * Hosting's own domain, never written in the repository; production's is its
 * custom domain. A build without RP ID (local,
 * CI) has no web app: its point of sale shares the invoice itself instead.
 */
const WEB_APP_ORIGIN = /^https:\/\/[a-z0-9.-]+$/;

/** The origin of this build's payment links, null when its variant has no web app. */
export function getPaymentLinkOrigin(): string | null {
  const origin: unknown = Constants.expoConfig?.extra?.webAppOrigin;
  return typeof origin === "string" && WEB_APP_ORIGIN.test(origin) ? origin : null;
}

/**
 * Where an integration's server sends its customers to pay (checkout links, src/lib/payment-link/
 * checkout.ts): the same web app, whose page `/pay` reads them. The owner's app names it in each
 * integration's channel (src/lib/team/channel.ts); null without a web app (no RP ID: local, CI):
 * the integrations' servers then make no checkout link (`checkout_unavailable`).
 */
export function getCheckoutOrigin(): string | null {
  return getPaymentLinkOrigin();
}
