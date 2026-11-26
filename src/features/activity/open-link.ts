import { router } from "expo-router";

import { PAYMENT_LINK_PATH } from "@/lib/payment-link/link";

/**
 * Opens the payer's page of a payment link (src/app/pay.tsx) from its details: in the apps, the
 * app's own screen, over the current one (never Linking.openURL: iOS would open the web app in
 * Safari). `onLeave` runs first: the details' sheet, a Modal, would stay over the page. Web:
 * open-link.web.ts, same API.
 */
export function openPaymentLinkPage(
  _url: string,
  fragment: `#${string}`,
  onLeave: () => void
): void {
  onLeave();
  router.push(`${PAYMENT_LINK_PATH}${fragment}`);
}
