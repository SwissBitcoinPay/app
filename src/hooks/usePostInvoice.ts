import { useCallback, useContext } from "react";
import {
  keyStoreIsGuest,
  keyStoreTransactionsHistory
} from "@config/settingsKeys";
import { AsyncStorage, Biometrics, getSha256 } from "@utils";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { useNavigate } from "@components/Router";
import { useTranslation } from "react-i18next";
import { SBPContext, apiRootUrl } from "@config";

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

  const { apiKey, currency, name, isOnchainAvailable, isAtm } =
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

        const isLocalInvoice = isAtm || !isGuestMode;

        let decimalFiat = amount;
        let finalUrl = "";
        let id = "";
        let additionnalHistoryProps = {};

        if (!isAtm) {
          navigate("/invoice", {
            state: {
              isLocalInvoice
            }
          });

          const { data: checkoutResponseData } = await axios.post<{
            checkoutUrl: string;
            expiry: number;
          }>(
            `${apiRootUrl}/checkout`,
            {
              amount,
              unit: unit || currency,
              title: `${name || ""}`,
              description,
              tag: "invoice-tpos",
              device: {
                name: deviceName,
                type: deviceType,
                appVersion: process.env.APP_VERSION
              },
              extra: {
                isGuestMode
              },
              onChain: isOnchainAvailable,
              delay: 10
            },
            {
              headers: { "Api-Key": apiKey }
            }
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

          const url = checkoutResponseData.checkoutUrl;
          id = url.split("/").pop() || "";
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
              "api-key": apiKey,
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

        const transactionsHistory = await AsyncStorage.getItem(
          keyStoreTransactionsHistory
        );

        navigate(finalUrl, {
          replace: true,
          state: {
            isLocalInvoice,
            unit: unit || currency,
            decimalFiat,
            customNote: description
          }
        });

        await AsyncStorage.setItem(
          keyStoreTransactionsHistory,
          JSON.stringify([
            ...JSON.parse(transactionsHistory || "[]"),
            {
              id: id,
              status: "open",
              time: Math.round(new Date().getTime() / 1000),
              input: {
                unit: unit || currency,
                amount: decimalFiat
              },
              tag: "invoice-tpos",
              ...(deviceName
                ? {
                    device: {
                      name: deviceName,
                      type: deviceType
                    }
                  }
                : {}),
              ...additionnalHistoryProps
            }
          ])
        );
      } catch (e) {
        if (axios.isAxiosError<{ reason: string }>(e)) {
          navigate("/");
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
      isAtm,
      currency,
      name,
      i18n.language,
      isOnchainAvailable,
      apiKey,
      t,
      toast
    ]
  );

  return postInvoice;
};
