import { CardPaymentSheet } from "./CardPaymentSheet";
import { useCardPaidNotices } from "./paid-notice";
import { useAppFrontMarker } from "./useAppFrontMarker";
import { useCardWakes } from "./useCardWakes";

/**
 * The payments of this device's cards (src/features/card/payments.ts): their wake packets taken
 * as they reach the phone, the one being paid shown over the app. Mounted once, by the owner's
 * shell (src/app/(app)/_layout.tsx): inside the point of sale's provider (the rate, the device
 * locale), in till mode too. Each payment that leaves is told by a notification (paid-notice.ts).
 * Same API on the web, where cards are not paid: CardPayments.web.tsx.
 */
export function CardPayments({ walletId }: { walletId: string }) {
  useCardWakes(walletId);
  useAppFrontMarker();
  useCardPaidNotices();
  return <CardPaymentSheet />;
}
