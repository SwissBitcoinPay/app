import { useTranslation } from "react-i18next";
import { Loader, ComponentStack } from "@components";
import { faBuildingColumns } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "styled-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { interpolateColors } from "@utils";
import { BitcoinSettings } from "./components";
import { SettingsTitle } from "./components/SettingsTitle";
import { FiatSettings } from "./components/FiatSettings";
import {
  Control,
  UseFormResetField,
  UseFormSetError,
  UseFormSetValue,
  UseFormTrigger,
  UseFormWatch,
  UseFormGetFieldState,
  useWatch
} from "react-hook-form";
import { isSEPACountry } from "ibantools";
import { AccountConfigType } from "@types";
import { Vibration } from "react-native";
import { useRates } from "@hooks";
import { RatesType } from "@hooks/useRates";
import {
  bankCurrencyMap,
  fiatCurrencies,
  HardwareType,
  platform
} from "@config";
import * as S from "./styled";
import { WalletConfig } from "@components/ConnectWalletModal/ConnectWalletModal";

const { isIos } = platform;

export type WalletType = "local" | HardwareType;

type BitcoinSettingsForm = {
  depositAddress?: string;
  words?: string;
  btcAddressTypes: {
    [k in "onchain" | "xpub" | "lightning"]: boolean | "loading" | "error";
  };
  nextAddresses?: string[];
  finalDepositAddress?: string;
  messageToSign?: string;
  signWithAddress?: string;
  prToPay?: string;
  hash?: string;
  isPrPaid?: boolean;
  signature?: string;
  walletType?: WalletType;
  walletConfig?: WalletConfig;
};

const bitcoinSettingsKeys: (keyof BitcoinSettingsForm)[] = [
  "depositAddress",
  "btcAddressTypes",
  "nextAddresses",
  "finalDepositAddress",
  "messageToSign",
  "signWithAddress",
  "prToPay",
  "hash",
  "isPrPaid",
  "signature",
  "walletType"
];

type FiatSettingsForm = {
  iban?: string;
  ownerName?: string;
  ownerAddress?: string;
  ownerComplement?: string;
  ownerZip?: string;
  ownerCity?: string;
  ownerCountry?: string;
  reference?: string;
};

const fiatSettingsKeys: (keyof FiatSettingsForm)[] = [
  "iban",
  "ownerName",
  "ownerAddress",
  "ownerComplement",
  "ownerZip",
  "ownerCity",
  "ownerCountry",
  "reference"
];

export type PayoutConfigForm = {
  btcPercent: number;
} & BitcoinSettingsForm &
  FiatSettingsForm;

export type BitcoinFiatFormSettings = {
  control: Control<PayoutConfigForm>;
  watch: UseFormWatch<PayoutConfigForm>;
  resetField: UseFormResetField<PayoutConfigForm>;
  setValue: UseFormSetValue<PayoutConfigForm>;
  setError: UseFormSetError<PayoutConfigForm>;

  rates?: RatesType;
  currency: AccountConfigType["currency"];
  setIsValid: (value: boolean) => void;
  isDiscountFees: boolean;
};

export type PayoutConfigProps = Omit<
  BitcoinFiatFormSettings,
  "rates" | "setIsValid"
> & {
  trigger: UseFormTrigger<PayoutConfigForm>;
  getFieldState: UseFormGetFieldState<PayoutConfigForm>;
};

export const PayoutConfig = ({
  control,
  watch,
  resetField,
  getFieldState,
  setValue,
  setError,
  trigger,
  currency,
  isDiscountFees
}: PayoutConfigProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });
  const theme = useTheme();
  const rates = useRates();

  const [isBtcSettingsValid, setIsBtcSettingsValid] = useState(false);
  const [isFiatSettingsValid, setIsFiatSettingsValid] = useState(false);

  const btcPercent = watch("btcPercent");

  const isReceiveBitcoin = useMemo(() => btcPercent >= 1, [btcPercent]);
  const isReceiveFiat = useMemo(() => btcPercent <= 99, [btcPercent]);

  useEffect(() => {
    if (currency && !fiatCurrencies.includes(currency)) {
      setValue("btcPercent", 100);
    }
  }, [currency]);

  const fields = useWatch({ control });

  useEffect(() => {
    (async () => {
      const currentBtcPercent =
        fields.btcPercent !== undefined ? fields.btcPercent : 100;
      const _isReceiveBitcoin = currentBtcPercent >= 1;
      const _isReceiveFiat = currentBtcPercent <= 99;

      if (_isReceiveBitcoin) {
        setIsBtcSettingsValid(await trigger(bitcoinSettingsKeys));
      }

      const touchedFiatSettingsKeys = fiatSettingsKeys.filter(
        (key) => getFieldState(key).isTouched
      );

      if (
        _isReceiveFiat &&
        fiatSettingsKeys.length === touchedFiatSettingsKeys.length
      ) {
        setIsFiatSettingsValid(await trigger(fiatSettingsKeys));
      }
    })();
  }, [fields]);

  const ownerCountry = watch("ownerCountry");

  const isEURInstantSEPA = useMemo(
    () =>
      true &&
      currency === "EUR" &&
      (!ownerCountry || isSEPACountry(ownerCountry || "")),
    [currency, ownerCountry]
  );

  const isGBPFasterPayments = useMemo(
    () =>
      false && currency === "GBP" && (ownerCountry === "GB" || !ownerCountry),
    [ownerCountry, currency]
  );

  const isInstant = useMemo(
    () => isEURInstantSEPA || isGBPFasterPayments,
    [isEURInstantSEPA, isGBPFasterPayments]
  );

  const sliderColor = useMemo(
    () =>
      interpolateColors(
        theme.colors.primary,
        theme.colors.bitcoin,
        btcPercent / 100
      ),
    [theme.colors.bitcoin, theme.colors.primary, btcPercent]
  );

  const onSliderValueChange = useCallback(
    (value: number) => {
      const newValue = 100 - value;

      const isOneSide = newValue % 100 === 0;

      if ((isIos && isOneSide) || !isIos) {
        Vibration.vibrate(isOneSide ? 50 : 15);
      }
      setValue("btcPercent", newValue, {
        shouldDirty: newValue !== btcPercent
      });
    },
    [setValue, btcPercent]
  );

  const formProps = useMemo(
    () => ({
      rates,
      setIsValid: () => {},

      control,
      watch,
      resetField,
      setValue,
      setError
    }),
    [rates, control, watch, resetField, setValue, setError]
  );

  const onFullBtc = useCallback(() => {
    onSliderValueChange(0);
  }, [onSliderValueChange]);

  const onFullFiat = useCallback(() => {
    onSliderValueChange(100);
  }, [onSliderValueChange]);

  const bankCurrency = useMemo<AccountConfigType["currency"]>(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    () => bankCurrencyMap[currency] || currency,
    [currency]
  );

  if (!currency) {
    return <Loader />;
  }

  return (
    <ComponentStack>
      {fiatCurrencies.includes(currency) && (
        <ComponentStack>
          <S.TitleText>{t("iWantToReceive")}</S.TitleText>
          <S.SliderContainer>
            <S.BtcPercentSlider
              disabled={!fiatCurrencies.includes(currency || "")}
              value={100 - btcPercent}
              minimumValue={0}
              maximumValue={100}
              step={5}
              onValueChange={onSliderValueChange}
              minimumTrackTintColor={sliderColor}
              maximumTrackTintColor={sliderColor}
              thumbTintColor={sliderColor}
            />
          </S.SliderContainer>
          <S.SliderDataContainer>
            <S.SliderContentSide isTranslucent={btcPercent === 0}>
              <S.ValueContent
                bgColor={theme.colors.bitcoin}
                onPress={onFullBtc}
              >
                <S.PercentageText>{btcPercent}%</S.PercentageText>
                <S.SubPercentageView>
                  <S.BtcLogo
                    size={24}
                    color={theme.colors.white}
                    iconBackgroundColor={theme.colors.bitcoin}
                  />
                  <S.PayoutTypeText>{t("in")} Bitcoin</S.PayoutTypeText>
                </S.SubPercentageView>
              </S.ValueContent>
              <S.SliderDetailsText>
                💸 {t("fees", { percent: 1 })}
              </S.SliderDetailsText>
              <S.SliderDetailsText>
                🔑 {t("cryptoSignature")}
              </S.SliderDetailsText>
            </S.SliderContentSide>
            <S.SliderContentSide isRight isTranslucent={btcPercent === 100}>
              <S.ValueContent bgColor={theme.colors.grey} onPress={onFullFiat}>
                <S.PercentageText>{100 - btcPercent}%</S.PercentageText>
                <S.SubPercentageView>
                  <S.FiatIcon
                    icon={faBuildingColumns}
                    size={20}
                    color={theme.colors.white}
                  />
                  <S.PayoutTypeText color={theme.colors.grey}>
                    {t("in")} {bankCurrency}
                  </S.PayoutTypeText>
                </S.SubPercentageView>
              </S.ValueContent>
              <S.SliderDetailsText>
                {t("fees", { percent: 1.5 })} 💸
              </S.SliderDetailsText>
              <S.SliderDetailsText>
                {isInstant
                  ? `${t("instantTransfer")} ⚡`
                  : `${t("dailyTransfer")} 🔄`}
              </S.SliderDetailsText>
            </S.SliderContentSide>
          </S.SliderDataContainer>
        </ComponentStack>
      )}
      {isReceiveBitcoin && (
        <ComponentStack>
          <SettingsTitle
            title={t("bitcoinSettings")}
            isValid={isBtcSettingsValid}
          />
          <BitcoinSettings
            {...formProps}
            currency={currency}
            isDiscountFees={isDiscountFees}
          />
        </ComponentStack>
      )}
      {isReceiveFiat && (
        <ComponentStack>
          <SettingsTitle
            title={t("bankSettings")}
            isValid={isFiatSettingsValid}
          />
          <FiatSettings
            {...formProps}
            currency={bankCurrency}
            isEURInstantSEPA={isEURInstantSEPA}
            isGBPFasterPayments={isGBPFasterPayments}
            isDiscountFees={isDiscountFees}
          />
        </ComponentStack>
      )}
    </ComponentStack>
  );
};
