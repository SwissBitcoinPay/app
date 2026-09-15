import { useTranslation } from "react-i18next";
import { Loader, PageContainer, PayoutConfig } from "@components";
import { useNavigate } from "@components/Router";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useState } from "react";
import { useAccountConfig } from "@hooks";
import { useToast } from "react-native-toast-notifications";
import type { PayoutConfigForm } from "@components/PayoutConfig/PayoutConfig";
import { useForm, type SubmitHandler } from "react-hook-form";
import { api, FetchError, type AccountConfigType } from "@types";
import { getPayoutConfigDefaultValues } from "./getPayoutConfigDefaultValues";

// Refus de saisie du back-end : `{field, detail}` en corps JSON, remonté par
// `client.fetch` dans `FetchError.message` (cf. helpers/errors.ts côté server).
const parseFieldError = (e: unknown) => {
  if (!(e instanceof FetchError)) return undefined;
  try {
    const { field, detail } = JSON.parse(e.message) as {
      field?: string;
      detail?: string;
    };
    return field && detail ? { field, detail } : undefined;
  } catch {
    return undefined;
  }
};

type PayoutConfigFormScreenProps = {
  accountConfig: AccountConfigType;
  currency: NonNullable<AccountConfigType["currency"]>;
};

const PayoutConfigFormScreen = ({
  accountConfig,
  currency
}: PayoutConfigFormScreenProps) => {
  const navigate = useNavigate();
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });
  const toast = useToast();

  const {
    handleSubmit,
    formState,
    control,
    watch,
    setValue,
    setError,
    resetField,
    getFieldState,
    trigger
  } = useForm<PayoutConfigForm>({
    mode: "onTouched",
    defaultValues: getPayoutConfigDefaultValues(accountConfig)
  });

  const [isSubmiting, setIsSubmiting] = useState(false);

  const onSubmit = useCallback<SubmitHandler<PayoutConfigForm>>(
    async (values) => {
      setIsSubmiting(true);

      const {
        btcPercent,
        depositAddress,
        messageToSign,
        iban,
        reference,
        ownerName,
        ownerAddress,
        ownerComplement,
        ownerZip,
        ownerCity,
        ownerCountry,
        walletConfig
      } = values;

      const isReceiveBitcoin = btcPercent >= 1;
      const isReceiveFiat = btcPercent <= 99;

      try {
        // La signature a déjà été consommée par `accounts.verifySignature`
        // (cf. BitcoinSettings) : le PATCH ne transmet que `message`.
        await api.accounts.update(accountConfig.id, {
          btc_percent: btcPercent,
          ...(isReceiveBitcoin
            ? {
                deposit_address: depositAddress,
                message: messageToSign,
                wallet_config: walletConfig
              }
            : {}),
          ...(isReceiveFiat
            ? {
                iban,
                bank_reference: reference || undefined,
                owner_name: ownerName,
                owner_address: ownerAddress,
                owner_complement: ownerComplement || undefined,
                owner_zip: ownerZip,
                owner_city: ownerCity,
                owner_country: ownerCountry
              }
            : {})
        });

        toast.show(t("patchSettingNeedsEmailValidation"), {
          type: "info"
        });
        navigate(-1);
      } catch (e) {
        const fieldError = parseFieldError(e);

        // Le back-end renvoie le nom de colonne (snake_case) ; le formulaire
        // est en camelCase.
        const errorField = fieldError?.field.replace(/_(.)/g, (_, c: string) =>
          c.toUpperCase()
        ) as keyof PayoutConfigForm | undefined;

        const errorMessage = fieldError
          ? t(`error.${errorField}.${fieldError.detail}`, {
              defaultValue: tRoot("common.errors.unknown")
            })
          : tRoot("common.errors.unknown");

        if (errorField) {
          setError(errorField, { message: errorMessage });
        }

        toast.show(errorMessage, {
          type: "error"
        });
      }
      setIsSubmiting(false);
    },
    [accountConfig.id, navigate, t, tRoot, toast, setError]
  );

  return (
    <PageContainer
      header={{
        left: { icon: faArrowLeft, onPress: -1 },
        title: t("title")
      }}
      footerButton={{
        type: "bitcoin",
        disabled:
          !formState.isValid || Object.keys(formState.dirtyFields).length === 0,
        isLoading: isSubmiting,
        title: tRoot("common.submit"),
        onPress: handleSubmit(onSubmit)
      }}
    >
      <PayoutConfig
        control={control}
        watch={watch}
        setValue={setValue}
        setError={setError}
        resetField={resetField}
        trigger={trigger}
        getFieldState={getFieldState}
        currency={currency}
        isDiscountFees={false}
      />
    </PageContainer>
  );
};

export const PayoutConfigScreen = () => {
  const { accountConfig, isLoading } = useAccountConfig();
  const currency = accountConfig?.currency;

  if (isLoading || !accountConfig || !currency) {
    return <Loader />;
  }

  return (
    <PayoutConfigFormScreen accountConfig={accountConfig} currency={currency} />
  );
};
