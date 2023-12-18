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
import { Controller } from "react-hook-form";
import { useCallback, useMemo } from "react";
import { getFormattedUnit } from "@utils";
import { countries } from "@config";
import { DescriptionLine } from "../DescriptionLine";
import isValidZipcode from "is-valid-zipcode";
import { BitcoinFiatFormSettings } from "@components/PayoutConfig/PayoutConfig";

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
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });

  const ownerCountry = watch("ownerCountry");

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
        const btcPriceInChf = rates.BTCCHF.CHF;
        const btcPriceInCurrency = rates[`BTC${currency}`][currency];
        return (amount * (btcPriceInCurrency || 0)) / (btcPriceInChf || 0);
      }
      return 0;
    },
    [rates, currency]
  );

  const isInstant = useMemo(
    () => isEURInstantSEPA || isGBPFasterPayments,
    [isEURInstantSEPA, isGBPFasterPayments]
  );

  const isSwift = useMemo(
    () => !["CHF", "EUR", "GBP"].includes(currency || ""),
    [currency]
  );

  return (
    <ComponentStack>
      <ComponentStack gapSize={14}>
        <DescriptionLine>
          <FieldDescription>💶 {t("feesDetails1")}</FieldDescription>
          <FieldDescription>1.5%</FieldDescription>
        </DescriptionLine>
        <FieldDescription>
          🏦{" "}
          {t("receiveInBankDescription1", {
            currency
          })}{" "}
          <Url
            as={FieldDescription}
            title="Mt Pelerin"
            href="https://mtpelerin.com"
          />
          .
        </FieldDescription>
        <FieldDescription>
          🔄{" "}
          {t(`receiveInBankDescription2${isInstant ? "Instant" : "Batched"}`, {
            formattedAmount: getFormattedUnit(
              !isSwift ? 50 : chfToFiat(101),
              currency,
              isSwift ? 2 : 0
            )
          })}
        </FieldDescription>
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
            rules={{
              required: true
            }}
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error }
            }) => {
              return (
                <SelectField
                  label={t("ownerCountry")}
                  items={countries}
                  value={value}
                  onValueChange={onChange}
                  onBlur={onBlur}
                  error={error?.message}
                />
              );
            }}
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
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
          return (
            <FieldContainer icon={faBuildingColumns} title={t("yourIban")}>
              <TextField
                label={t("iban")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCorrect={false}
                error={error?.message}
                autoCapitalize="characters"
                pastable
              />
            </FieldContainer>
          );
        }}
      />
      <Controller
        name="ownerName"
        control={control}
        rules={{
          required: true
        }}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />
      <Controller
        name="ownerAddress"
        control={control}
        rules={{
          required: true
        }}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />
      <Controller
        name="ownerComplement"
        control={control}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />
      <Controller
        name="ownerZip"
        control={control}
        rules={{
          required: true,
          validate: validateZipcode
        }}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />
      <Controller
        name="ownerCity"
        control={control}
        rules={{
          required: true
        }}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />

      <Controller
        name="reference"
        control={control}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error }
        }) => {
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
        }}
      />
    </ComponentStack>
  );
};
