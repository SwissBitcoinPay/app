import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CardPayArt } from "@/components/illustrations/cards";
import { IntegrationKeyArt } from "@/components/illustrations/integrations";
import { TeamInviteArt } from "@/components/illustrations/team";
import {
  WalletFollowArt,
  WalletReceiveArt,
  WalletTakeArt
} from "@/components/illustrations/wallet";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { StepGuide, type GuideStep } from "@/components/ui/StepGuide";
import { getAccountSettings } from "@/features/account/session";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { useServiceEnds } from "@/features/migration/TransferStatus";

/**
 * "What changes" (explained to the owner only), from "Your account is up to date": the v2
 * account is frozen as the sattle.me account is created (it takes no payment at all, its money
 * paid out to sattle.me at once, over Lightning), and what that changes for their employees,
 * online shop, limits (none tied to identity verification any more), money, cards and history,
 * each a step of the empty screens' guide (StepGuide, its drawings). In words a merchant reads.
 *
 * For an open account only (the owner's: a till never comes here).
 */
export default function MigrationChangesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ends = useServiceEnds();
  if (!getAccountSettings()) return <Redirect href="/" />;
  const dates = { merchantEnd: ends.merchant, cardEnd: ends.card };
  const steps: GuideStep[] = (
    [
      { key: "employees", Art: TeamInviteArt },
      { key: "shop", Art: IntegrationKeyArt },
      { key: "limits", Art: WalletTakeArt },
      { key: "money", Art: WalletReceiveArt },
      { key: "cards", Art: CardPayArt },
      { key: "history", Art: WalletFollowArt }
    ] as const
  ).map(({ key, Art }) => ({
    key,
    Art,
    title: t(`migration.changes.items.${key}.title`, dates),
    caption: t(`migration.changes.items.${key}.caption`, dates)
  }));
  return (
    <MigrationFrame testID="migration-changes">
      <ScreenTitle>{t("migration.changes.title")}</ScreenTitle>
      <Lead>{t("migration.changes.lead")}</Lead>
      <Callout tone="warning" testID="migration-changes-frozen">
        {t("migration.changes.frozen")}
      </Callout>
      <StepGuide
        steps={steps}
        label={t("migration.changes.title")}
        testID="migration-changes-list"
      />
      <Button
        variant="secondary"
        size="md"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        testID="migration-changes-back"
      >
        {t("common.back")}
      </Button>
    </MigrationFrame>
  );
}
