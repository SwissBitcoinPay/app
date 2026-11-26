import { MemberRubricScreen } from "@/features/settings/MemberSettings";
import { OwnerRubricScreen } from "@/features/settings/RubricScreen";
import { usePos } from "@/features/terminal/pos";
import { isMemberProfile } from "@/lib/terminal/model";

/**
 * "Network" of "Settings", on a phone: the owner's (the relays, the Bitcoin node, the product
 * lookup: OwnerRubrics.tsx), or an employee's, the relays read only (MemberSettings.tsx).
 */
export default function SettingsNetwork() {
  const { profile } = usePos();
  return isMemberProfile(profile) ? (
    <MemberRubricScreen rubric="network" />
  ) : (
    <OwnerRubricScreen rubric="network" />
  );
}
