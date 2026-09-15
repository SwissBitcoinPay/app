import { useCallback, useContext } from "react";
import {
  keyStoreIsGuest,
  keyStoreLocalTransactionsIds
} from "@config/settingsKeys";
import { AsyncStorage, Biometrics, getSha256 } from "@utils";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { useNavigate } from "@components/Router";
import { useTranslation } from "react-i18next";
import { SBPContext, apiRootUrl } from "@config";
import { api, FetchError, handleApiError } from "@types";

type PostInvoiceParams = {
  amount: number;
  unit?: string;
  description?: string;
  deviceName?: string;
  deviceType?: string;
};

export const usePostInvoice = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { accountConfig } = useContext(SBPContext);

  const { invoice_key, currency, name, is_onchain_available, is_atm } =
    accountConfig || {};

  const postInvoice = useCallback(
    async ({
      amount,
      unit,
      description,
      deviceName,
      deviceType
    }: PostInvoiceParams) => {
      try {
        const isGuestMode =
          (await AsyncStorage.getItem(keyStoreIsGuest)) === "true";

        const isLocalInvoice = is_atm || !isGuestMode;

        let decimalFiat = amount;
        let finalUrl = "";
        let id = "";
        let additionnalHistoryProps = {};

        if (!is_atm) {
          navigate("/invoice", {
            state: {
              isLocalInvoice
            }
          });

          const checkoutResponseData = await api.apipayments.checkout(
            {
              amount,
              unit: unit || currency || "",
              title: `${name || ""}`,
              description,
              tag: "invoice-tpos",
              device: {
                name: deviceName,
                type: deviceType,
                appVersion: process.env.APP_VERSION
              },
              extra: { isGuestMode },
              onChain: is_onchain_available,
              delay: 10
            },
            invoice_key ? { apiKey: invoice_key } : undefined
          );

          additionnalHistoryProps = {
            device: {
              name: deviceName,
              type: deviceType,
              appVersion: process.env.APP_VERSION
            },
            description,
            expiry: checkoutResponseData.expiry
          };

          console.log({ checkoutResponseData });

          id = checkoutResponseData.id;
          finalUrl = `/invoice/${id}`;
        } else {
          const ret = await Biometrics.isSensorAvailable();

          if (ret.available) {
            const biometricsResponse = await Biometrics.simplePrompt({
              promptMessage: t("screens.pos.allowWithdraw")
            });

            if (!biometricsResponse.success) {
              return;
            }
          }

          navigate("/invoice", {
            state: {
              isLocalInvoice
            }
          });

          const data = {
            amount,
            unit: unit || currency,
            language: i18n.language,
            device: {
              name: deviceName,
              type: deviceType
            },
            description
          };

          const { data: withdrawResponseData } = await axios.post<{
            id: string;
            lnurl: string;
            amount: number;
            fiatAmount: number;
          }>(`${apiRootUrl}/atm-withdraw`, data, {
            headers: {
              "api-key": invoice_key,
              "sbp-sig": `sha256=${
                (await getSha256(JSON.stringify(data))) || ""
              }`
            }
          });

          id = withdrawResponseData.id;
          finalUrl = `/invoice/${withdrawResponseData.lnurl}`;

          additionnalHistoryProps = {
            ...additionnalHistoryProps,
            lnurl: withdrawResponseData.lnurl,
            amount: withdrawResponseData.amount,
            description
          };

          decimalFiat = withdrawResponseData.fiatAmount;
        }

        navigate(finalUrl, {
          replace: true,
          state: {
            isLocalInvoice,
            unit: unit || currency,
            decimalFiat,
            customNote: description
          }
        });

        const localTransactionsIds = await AsyncStorage.getItem(
          keyStoreLocalTransactionsIds
        );

        void AsyncStorage.setItem(
          keyStoreLocalTransactionsIds,
          JSON.stringify([...JSON.parse(localTransactionsIds || "[]"), id])
        );
      } catch (e) {
        navigate("/");
        if (e instanceof FetchError) {
          const { message } = handleApiError(e, t);
          toast.show(message, { type: "error" });
        } else if (axios.isAxiosError<{ reason: string }>(e)) {
          if (e.response?.data) {
            toast.show(t(e.response.data.reason), {
              type: "error"
            });
          }
        } else {
          toast.show(e?.toString?.() || "unknown error", { type: "error" });
        }
      }
    },
    [
      navigate,
      is_atm,
      currency,
      name,
      i18n.language,
      is_onchain_available,
      invoice_key,
      t,
      toast
    ]
  );

  return postInvoice;
};
