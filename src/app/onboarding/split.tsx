import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import { CurrencyPicker } from "@/components/CurrencyPicker";
import { StepScreen } from "@/components/layout/StepScreen";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { SplitBar } from "@/features/onboarding/SplitBar";
import { SplitFees } from "@/features/onboarding/SplitFees";
import { hasFiatShare, splitAnswers, useOnboarding } from "@/features/onboarding/state";
import { useFinishSignUp } from "@/features/onboarding/useFinishSignUp";
import { formatPercent } from "@/lib/locale/format";

/**
 * The split step. The bar starts at 100 % bitcoin: the account is then complete and
 * the button saves the settings, then opens the point of sale. From 1 % in fiat, a third dot
 * appears and the button becomes "Continue": it saves the share and the currency, then opens the
 * bank details, which ask for the Mt Pelerin login first (bank.tsx). The currency tag of the bar
 * changes the payout currency, detected until then. The merchant sign-up's first step, from
 * "Create my account".
 */
export default function SplitScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { bitcoinPercent, setBitcoinPercent, payoutCurrency, setPayoutCurrency, device } =
    useOnboarding();
  const { save, finish, saving, failed, errorKey } = useFinishSignUp();
  const [picking, setPicking] = useState(false);
  const fiatPercent = 100 - bitcoinPercent;
  const hasFiat = hasFiatShare(bitcoinPercent);
  const percent = (value: number) => formatPercent(value, device.languageTag);
  const currencyName = t(`currencyNames.${payoutCurrency}`);

  const next = () => {
    if (hasFiat) {
      save({ ...splitAnswers({ bitcoinPercent, payoutCurrency }), signUp: "bank" }, () =>
        router.push("/onboarding/bank")
      );
    } else {
      finish();
    }
  };

  return (
    <StepScreen
      footer={
        <>
          {failed ? <ErrorMessage style={styles.error}>{t(errorKey)}</ErrorMessage> : null}
          <Button onPress={next} loading={saving} testID="split-continue">
            {hasFiat ? t("common.continue") : t("common.startCharging")}
          </Button>
        </>
      }
    >
      <ScreenTitle>{t("split.title")}</ScreenTitle>
      <Lead style={desktop ? styles.leadDesktop : undefined}>{t("split.description")}</Lead>

      <SplitBar
        bitcoinPercent={bitcoinPercent}
        onChange={setBitcoinPercent}
        currency={payoutCurrency}
        onPickCurrency={() => setPicking(true)}
        languageTag={device.languageTag}
        bitcoinLabel={t("split.bitcoin")}
        accessibilityLabel={t("split.sliderLabel")}
        accessibilityValueText={t("split.sliderValue", {
          bitcoin: percent(bitcoinPercent),
          fiat: percent(fiatPercent),
          currency: t(`currencies.${payoutCurrency}`)
        })}
        currencyLabel={t("split.currencyButton", { currency: currencyName })}
        testID="split-slider"
      />

      <SplitFees
        payoutCurrency={payoutCurrency}
        hasFiat={hasFiat}
        languageTag={device.languageTag}
      />

      <CurrencyPicker
        visible={picking}
        value={payoutCurrency}
        onSelect={setPayoutCurrency}
        onClose={() => setPicking(false)}
      />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  leadDesktop: { marginTop: 12, fontSize: 15, lineHeight: 15 * 1.5 },
  error: { marginBottom: 14 }
});
