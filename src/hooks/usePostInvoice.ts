import { useCallback, useContext } from "react";
import { keyStoreTransactionsHistory } from "@config/settingsKeys";
import { intlFormat } from "date-fns";
import { AsyncStorage, Biometrics, getSha256 } from "@utils";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { useNavigate } from "@components/Router";
import { useTranslation } from "react-i18next";
import { SBPContext, apiRootUrl } from "@config";

type PostInvoiceParams = {
  amount: number;
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
      description,
      deviceName,
      deviceType
    }: PostInvoiceParams) => {
      try {
        let finalUrl = "";
        let id = "";
        let additionnalHistoryProps = {};

        if (!isAtm) {
          navigate("/invoice", {
            state: {
              isLocalInvoice: true
            }
          });
          const { data: checkoutResponseData } = await axios.post<{
            checkoutUrl: string;
          }>(
            `${apiRootUrl}/checkout`,
            {
              amount,
              unit: currency,
              title: `${name || ""}`,
              description:
                description ||
                intlFormat(
                  Date.now(),
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                    formatMatcher: "basic"
                  },
                  { locale: i18n.language }
                ),
              extra: {
                tag: "invoice-tpos",
                deviceName,
                deviceType,
                customNote: description
              },
              onChain: isOnchainAvailable,
              delay: 10 || 10
            },
            {
              headers: { "Api-Key": apiKey }
            }
          );

          const url = checkoutResponseData.checkoutUrl;
          id = url.split("/").pop() || "";
          finalUrl = `/invoice/${id}`;
        } else {
          const ret = await Biometrics.isSensorAvailable();

          if (ret.available) {
            const biometricsResponse = await Biometrics.simplePrompt({
              promptMessage: t("allowWithdraw")
            });

            if (!biometricsResponse.success) {
              return;
            }
          }

          navigate("/invoice");

          const data = {
            amount,
            unit: currency,
            language: i18n.language,
            deviceName,
            deviceType,
            customNote: description
          };

          const { data: withdrawResponseData } = await axios.post<{
            lnurl?: string;
            amount: number;
          }>(`${apiRootUrl}/atm-withdraw`, data, {
            headers: {
              "api-key": apiKey,
              "sbp-sig": `sha256=${
                (await getSha256(JSON.stringify(data))) || ""
              }`
            }
          });

          id = withdrawResponseData.lnurl || "";
          finalUrl = `/invoice/${id}`;

          additionnalHistoryProps = {
            ...additionnalHistoryProps,
            amount: withdrawResponseData.amount
          };
        }

        const transactionsHistory = await AsyncStorage.getItem(
          keyStoreTransactionsHistory
        );

        navigate(finalUrl, {
          replace: true,
          state: {
            isLocalInvoice: true,
            unit: currency,
            decimalFiat: amount,
            customNote: description
          }
        });

        await AsyncStorage.setItem(
          keyStoreTransactionsHistory,
          JSON.stringify([
            ...JSON.parse(transactionsHistory || "[]"),
            {
              id: id,
              isExpired: false,
              createdAt: new Date().getTime() / 1000,
              fiatAmount: amount,
              fiatUnit: currency,
              ...additionnalHistoryProps
            }
          ])
        );
      } catch (e) {
        if (axios.isAxiosError<string>(e)) {
          navigate("/");
          if (e.response?.data) {
            toast.show(t(e.response.data), {
              type: "error"
            });
          }
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
