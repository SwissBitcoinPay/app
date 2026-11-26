/**
 * Same API as open-link.ts: the payer's page of a payment link in a new tab, the wallet (and the
 * details, so `onLeave` is not called) staying in this one. Within the click's handler: browsers
 * only open a tab right after a user gesture.
 */
export function openPaymentLinkPage(
  url: string,
  _fragment: `#${string}`,
  _onLeave: () => void
): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
