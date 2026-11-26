import { MemberActivityScreen } from "@/features/activity/MemberActivityScreen";
import { usePos } from "@/features/terminal/pos";
import { WalletScreen } from "@/features/wallet/WalletScreen";
import { isMemberProfile } from "@/lib/terminal/model";

/**
 * "Wallet" (the owner: the wallet and everything the business took) or "My activity"
 * (an employee: its own sales and links), one screen with two views.
 */
export default function WalletRoute() {
  const { profile } = usePos();
  return isMemberProfile(profile) ? <MemberActivityScreen /> : <WalletScreen />;
}
