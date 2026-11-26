import { MemberRubricScreen } from "@/features/settings/MemberSettings";
import { OwnerRubricScreen } from "@/features/settings/RubricScreen";
import { usePos } from "@/features/terminal/pos";
import { isMemberProfile } from "@/lib/terminal/model";

/**
 * "Display" of "Settings", on a phone: the owner's or a card holder's (OwnerRubrics.tsx), or
 * an employee's, its device's "Theme" (MemberSettings.tsx).
 */
export default function SettingsDisplay() {
  const { profile } = usePos();
  return isMemberProfile(profile) ? (
    <MemberRubricScreen rubric="display" />
  ) : (
    <OwnerRubricScreen rubric="display" />
  );
}
