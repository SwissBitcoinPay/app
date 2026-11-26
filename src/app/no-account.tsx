import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Callout } from "@/components/ui/Callout";
import {
  clearAccountNotFound,
  getAccountNotFound,
  type AccountNotFound
} from "@/features/account/not-found";
import { DeviceRelaysScreen } from "@/features/relays/DeviceRelaysScreen";
import { useTerminalProfile } from "@/features/terminal/profile-cache";

/**
 * "No account found": a login whose
 * passkey's account has no backup on the device's relays (AccountNotFoundError, session.ts). Says
 * what the relays answered, never more than they proved (none answered: nothing is known of the
 * account), and asks whether the account uses relays of its own: the device's list is edited here,
 * as in "Advanced settings", then "Log in" looks for the account on it. No sign-up from here:
 * "Create my account" creates a passkey of its own.
 *
 * Only after such a login, read once (not-found.ts): opened otherwise (the web app's address, a
 * reload), or on a device that takes payments, the launch screen decides.
 */
export default function NoAccountScreen() {
  const profile = useTerminalProfile({ follow: false });
  const [lookup] = useState(getAccountNotFound);
  // Left: a later visit says nothing of a login it did not follow.
  useEffect(() => clearAccountNotFound, []);
  // Read from the device's storage: an instant.
  if (profile === undefined) return null;
  if (profile || !lookup) return <Redirect href="/" />;
  return <NoAccount lookup={lookup} />;
}

function NoAccount({ lookup }: { lookup: AccountNotFound }) {
  const { t } = useTranslation();
  const unreachable = lookup.answered === "none";
  return (
    <DeviceRelaysScreen
      title={t(unreachable ? "noAccount.unreachableTitle" : "noAccount.title")}
      lead={t("noAccount.lead")}
      above={
        <Callout tone="warning" testID="no-account-callout">
          {t(`noAccount.answered.${lookup.answered}`)}
        </Callout>
      }
      testID="no-account"
    />
  );
}
