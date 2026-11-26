import { useTranslation } from "react-i18next";

import type { IconName } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { OnchainSpeed } from "@/lib/breez/types";

const SPEEDS: readonly OnchainSpeed[] = ["fast", "medium", "slow"];

/**
 * Each speed's glyph. Never `bolt`: in the app it means Lightning, and these speeds are on-chain
 * only.
 */
const SPEED_ICONS: Record<OnchainSpeed, IconName> = {
  fast: "rocket",
  medium: "gauge",
  slow: "piggy-bank"
};

/**
 * The speed of an on-chain payment ("Send", "Empty the card"): "Fast", "Normal", "Economy", each
 * with its icon, sharing the whole width. `locked`: the payment is being sent (or retried at that
 * very speed): shown disabled.
 */
export function SpeedControl({
  value,
  onChange,
  locked,
  testID
}: {
  value: OnchainSpeed;
  onChange: (speed: OnchainSpeed) => void;
  locked: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={t("wallet.sendSheet.speed")}
      options={SPEEDS.map((speed) => ({
        value: speed,
        label: t(`wallet.sendSheet.speeds.${speed}`),
        icon: SPEED_ICONS[speed]
      }))}
      value={value}
      onChange={onChange}
      stretch
      disabled={locked}
      testID={testID}
    />
  );
}
