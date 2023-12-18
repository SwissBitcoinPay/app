import { useTranslation } from "react-i18next";
import { Loader, PageContainer, PayoutConfig } from "@components";
import { useNavigate } from "@components/Router";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountConfig } from "@hooks";
import { apiRootUrl, currencyToCountry } from "@config";
import { isApiError } from "@utils";
import axios from "axios";
import { useToast } from "react-native-toast-notifications";
import { PayoutConfigForm } from "@components/PayoutConfig/PayoutConfig";
import { SubmitHandler, useForm } from "react-hook-form";

export const PayoutConfigScreen = () => {
  const navigate = useNavigate();
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });
  const { accountConfig } = useAccountConfig();
  const toast = useToast();

  const {
    handleSubmit,
    formState,
    control,
    watch,
    setValue,
    setError,
    resetField,
    trigger
  } = useForm<PayoutConfigForm>({
    mode: "onTouched",
    defaultValues: {
      depositAddress: accountConfig?.depositAddress,
      btcAddressTypes: {
        onchain: false,
        lightning: false,
        xpub: false
      },
      ownerCountry:
        // @ts-ignore
        accountConfig?.ownerCountry || currencyToCountry[currency],
      iban: accountConfig?.iban,
      ownerName: accountConfig?.ownerName,
      ownerAddress: accountConfig?.ownerAddress,
      ownerComplement: accountConfig?.ownerComplement,
      ownerZip: accountConfig?.ownerZip,
      ownerCity: accountConfig?.ownerCity,
      reference: accountConfig?.reference
    }
  });

  useEffect(() => {
    setValue("btcPercent", accountConfig?.btcPercent || 0);
  }, []);


  const [isSubmiting, setIsSubmiting] = useState(false);

  const currency = useMemo(
    () => accountConfig?.currency,
    [accountConfig?.currency]
  );

  const onSubmit = useCallback<SubmitHandler<PayoutConfigForm>>(
    async (values) => {
      setIsSubmiting(true);

      const {
        btcPercent,
        depositAddress,
        messageToSign,
        signature,
        iban,
        reference,
        ownerName,
        ownerAddress,
        ownerComplement,
        ownerZip,
        ownerCity,
        ownerCountry
      } = values;

      const isReceiveBitcoin = btcPercent >= 1;
      const isReceiveFiat = btcPercent <= 99;

      try {
        const patchData = {
          btcPercent,
          ...(isReceiveBitcoin
            ? { depositAddress, message: messageToSign, signature }
            : {}),
          ...(isReceiveFiat
            ? {
                iban,
                reference,
                ownerName,
                ownerAddress,
                ownerComplement,
                ownerZip,
                ownerCity,
                ownerCountry
              }
            : {})
        };

        await axios.patch(`${apiRootUrl}/account`, patchData, {
          withCredentials: true
        });

        toast.show(t("patchSettingNeedsEmailValidation"), {
          type: "info"
        });
        navigate(-1);
      } catch (e) {
        if (isApiError(e)) {
          const errorField = e.response.data.field as keyof PayoutConfigForm;
          const errorKey = e.response.data.detail;

          const errorMessage = t(`error.${errorField}.${errorKey}`);

          toast.show(errorMessage, {
            type: "error"
          });
        } else {
          toast.show("error.unknown", {
            type: "error"
          });
        }
      }
      setIsSubmiting(false);
    },
    [navigate, t, toast]
  );

  if (!currency) {
    return <Loader />;
  }

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
        currency={currency}
      />
    </PageContainer>
  );
};
