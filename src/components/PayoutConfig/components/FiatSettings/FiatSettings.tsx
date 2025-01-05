import { useTranslation } from "react-i18next";
import {
  ComponentStack,
  TextField,
  FieldDescription,
  Url,
  SelectField,
  FieldContainer
} from "@components";
import { isValidIBAN } from "ibantools";
import {
  faBuildingColumns,
  faCity,
  faCommentDots,
  faFlag,
  faLocationDot,
  faShop
} from "@fortawesome/free-solid-svg-icons";
import { Controller, ControllerProps } from "react-hook-form";
import { useCallback, useContext, useMemo } from "react";
import { getFormattedUnit, isNewAccount as _isNewAccount } from "@utils";
import { SBPContext, countries } from "@config";
import { DescriptionLine } from "../DescriptionLine";
import isValidZipcode from "is-valid-zipcode";
import {
  BitcoinFiatFormSettings,
  PayoutConfigForm
} from "@components/PayoutConfig/PayoutConfig";
import { useTheme } from "styled-components";

type FiatSettingsProps = BitcoinFiatFormSettings & {
  isEURInstantSEPA: boolean;
  isGBPFasterPayments: boolean;
};

export const FiatSettings = ({
  rates,
  currency,
  control,
  watch,
  isEURInstantSEPA,
  isGBPFasterPayments
}: FiatSettingsProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });

  const { accountConfig } = useContext(SBPContext);

  const ownerCountry = watch("ownerCountry");
  const btcPercent = watch("btcPercent");

  const validateIban = useCallback(
    (value = "") => isValidIBAN(value) || t("ibanInvalid"),
    [t]
  );

  const validateZipcode = useCallback(
    (value = "") => isValidZipcode(value, ownerCountry) || t("zipInvalid"),
    [t, ownerCountry]
  );

  const chfToFiat = useCallback(
    (amount: number) => {
      if (rates) {
        const btcPriceInChf = rates.CHF;
        const btcPriceInCurrency = rates[currency];
        return (amount * (btcPriceInCurrency || 0)) / (btcPriceInChf || 0);
      }
      return 0;
    },
    [rates, currency]
  );

  const isNewAccount = useMemo(
    () => _isNewAccount(accountConfig?.createdAt),
    [accountConfig?.createdAt]
  );

  const isInstant = useMemo(
    () => isEURInstantSEPA || isGBPFasterPayments,
    [isEURInstantSEPA, isGBPFasterPayments]
  );

  const isSwift = useMemo(
    () => !["CHF", "EUR"].includes(currency || ""),
    [currency]
  );

  const isMainCurrencies = useMemo(
    () => !isSwift || currency === "GBP",
    [currency, isSwift]
  );

  const OwnerCountryField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerCountry">["render"]
  >(
    ({ field: { onChange, value }, fieldState: { error } }) => {
      return (
        <SelectField
          label={t("ownerCountry")}
          items={countries}
          value={value}
          onValueChange={onChange}
          error={error?.message}
        />
      );
    },
    [t]
  );

  const IbanField = useCallback<
    ControllerProps<PayoutConfigForm, "iban">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer icon={faBuildingColumns} title={t("yourIban")}>
          <TextField
            label={t("iban")}
            value={value}
            onChangeText={(newIbanValue) =>
              onChange(newIbanValue.toUpperCase())
            }
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            autoCapitalize="characters"
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const OwnerNameField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerName">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer icon={faShop} title={t("yourName")}>
          <TextField
            label={t("ownerName")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const OwnerAddressField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerAddress">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer icon={faLocationDot} title={t("yourAddress")}>
          <TextField
            label={t("ownerAddress")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const OwnerComplementField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerComplement">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer
          icon={faLocationDot}
          title={t("ownerComplement")}
          isOptionnal
        >
          <TextField
            label={t("optional")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const OwnerZipField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerZip">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer icon={faLocationDot} title={t("yourZip")}>
          <TextField
            label={t("ownerZip")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const OwnerCityField = useCallback<
    ControllerProps<PayoutConfigForm, "ownerCity">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer icon={faCity} title={t("yourCity")}>
          <TextField
            label={t("ownerCity")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  const ReferenceField = useCallback<
    ControllerProps<PayoutConfigForm, "reference">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <FieldContainer
          icon={faCommentDots}
          title={t("bankReference")}
          isOptionnal
        >
          <TextField
            label={t("optional")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCorrect={false}
            error={error?.message}
            pastable
          />
        </FieldContainer>
      );
    },
    [t]
  );

  return (
    <ComponentStack>
      <ComponentStack gapSize={14}>
        <FieldDescription>💶 {t("feesDetails1")}</FieldDescription>
        <ComponentStack gapSize={2}>
          <DescriptionLine>
            <FieldDescription isHighlighted={isNewAccount}>
              {t("feesFirstYear")}
            </FieldDescription>
            <FieldDescription isHighlighted={isNewAccount}>
              0.21%
            </FieldDescription>
          </DescriptionLine>
          <DescriptionLine>
            <FieldDescription isHighlighted={!isNewAccount}>
              {t("feesAfterwards")}
            </FieldDescription>
            <FieldDescription isHighlighted={!isNewAccount}>
              1.5%
            </FieldDescription>
          </DescriptionLine>
        </ComponentStack>
        <FieldDescription>
          🏦{" "}
          {t("receiveInBankDescription1", {
            percent: 100 - btcPercent,
            currency
          })}{" "}
          <Url
            as={FieldDescription}
            title="Mt Pelerin"
            href="https://mtpelerin.com"
          />
          .
        </FieldDescription>
        {!isSwift ? (
          <FieldDescription>
            🔄{" "}
            {t(
              `receiveInBankDescription2${isInstant ? "Instant" : "Batched"}`,
              {
                formattedAmount: getFormattedUnit(50, currency, 0)
              }
            )}
          </FieldDescription>
        ) : (
          <FieldDescription color={colors.warning}>
            ⚠️{" "}
            {t(`receiveInBankDescription2Swift`, {
              currency,
              formattedAmountLow: getFormattedUnit(
                isMainCurrencies ? 10 : chfToFiat(10),
                currency,
                isMainCurrencies ? 0 : 2
              ),
              formattedAmountHigh: getFormattedUnit(
                isMainCurrencies ? 50 : chfToFiat(50),
                currency,
                isMainCurrencies ? 0 : 2
              )
            })}
          </FieldDescription>
        )}
        {!isSwift ? (
          <FieldDescription>
            💰{" "}
            {t("receiveInBankDescription3", {
              formattedAmount: getFormattedUnit(
                !isSwift ? 1 : chfToFiat(1),
                currency,
                isSwift ? 2 : 0
              )
            })}
          </FieldDescription>
        ) : (
          <FieldDescription>
            💰{" "}
            {t("receiveInBankDescription3Swift", {
              formattedAmount: getFormattedUnit(chfToFiat(101), currency, 2)
            })}
          </FieldDescription>
        )}
        {isInstant && (
          <FieldDescription>
            ⚡{" "}
            {t(
              isEURInstantSEPA
                ? "receiveInBankDescriptionInstantSepa"
                : "receiveInBankDescriptionFasterPayments"
            )}
          </FieldDescription>
        )}
      </ComponentStack>
      <ComponentStack gapSize={6}>
        <FieldContainer icon={faFlag} title={t("yourCountry")}>
          <Controller
            name="ownerCountry"
            control={control}
            rules={{ required: true }}
            render={OwnerCountryField}
          />
        </FieldContainer>
      </ComponentStack>
      <Controller
        name="iban"
        control={control}
        rules={{
          required: true,
          validate: validateIban
        }}
        render={IbanField}
      />
      <Controller
        name="ownerName"
        control={control}
        rules={{
          required: true
        }}
        render={OwnerNameField}
      />
      <Controller
        name="ownerAddress"
        control={control}
        rules={{
          required: true
        }}
        render={OwnerAddressField}
      />
      <Controller
        name="ownerComplement"
        control={control}
        render={OwnerComplementField}
      />
      <Controller
        name="ownerZip"
        control={control}
        rules={{
          required: true,
          validate: validateZipcode
        }}
        render={OwnerZipField}
      />
      <Controller
        name="ownerCity"
        control={control}
        rules={{
          required: true
        }}
        render={OwnerCityField}
      />
      <Controller name="reference" control={control} render={ReferenceField} />
    </ComponentStack>
  );
};
