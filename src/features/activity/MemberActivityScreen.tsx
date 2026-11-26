import { useTranslation } from "react-i18next";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { useLoadingScene } from "@/components/ui/LoadingScene";
import { usePos } from "@/features/terminal/pos";
import { PosFrame } from "@/features/terminal/PosFrame";
import { isMemberProfile } from "@/lib/terminal/model";

import { useActivityFormat } from "./format";
import type { FollowUp } from "./model";
import { Failed, IdentityDesktop, IdentityMobile, Waiting } from "./parts";
import { useMemberActivity } from "./useActivity";
import { DesktopActivity, MobileActivity } from "./views";

/**
 * What an employee follows: its links open or underpaid. Not "Confirming": its records say a sale
 * was paid once it is settled, nothing while its on-chain payment is being confirmed
 * (useSaleRecord), and its device holds no wallet.
 */
const MEMBER_FOLLOW_UPS: readonly FollowUp[] = ["open", "underpaid"];

/**
 * "My activity", an employee's "Wallet": the same screen as the owner's, limited to this employee's
 * own operations, its sales at the point of sale and its payment links, read back from its own
 * records on the relays (src/features/activity/load.ts). Its name and "View limited to your own
 * transactions" in place of the balance; no "Send", no transfers, no "By".
 */
export function MemberActivityScreen() {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const { items, failed, retry } = useMemberActivity();
  const format = useActivityFormat();
  const title = t("navigation.memberWallet");
  const name = isMemberProfile(profile) ? profile.memberName : "";

  // Its loading scene (useLoadingScene): it fades out once read, then the list fades in.
  const loading = useLoadingScene(
    !failed && !items
      ? { scene: "wallet", label: t("activity.reading"), testID: "activity-reading" }
      : null
  );
  const waited = loading.waited;
  const body = failed ? (
    <Failed
      desktop={desktop}
      message={t("activity.loadFailed")}
      onRetry={retry}
      retryTestID="activity-retry"
    />
  ) : loading.scene ? (
    <Waiting desktop={desktop} {...loading.scene} />
  ) : null;

  if (desktop) {
    return (
      <DesktopActivity
        arrival={waited}
        title={title}
        aside={<IdentityDesktop name={name} />}
        items={body === null ? items : null}
        states={MEMBER_FOLLOW_UPS}
        rootTitle={t("activity.allYourMovements")}
        showBy={false}
        syncing={false}
        format={format}
      >
        {body}
      </DesktopActivity>
    );
  }
  return (
    <PosFrame title={title} desktopTitle={title}>
      {body === null && items ? (
        <MobileActivity
          arrival={waited}
          items={items}
          states={MEMBER_FOLLOW_UPS}
          rootTitle={t("activity.yourMovements")}
          showBy={false}
          syncing={false}
          format={format}
          // No day's net (no `listedFrom`): its records, read from the relays, are never known
          // whole.
          top={<IdentityMobile name={name} />}
        />
      ) : (
        body
      )}
    </PosFrame>
  );
}
