import { useEffect, useState } from "react";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import { api } from "@types";
import { currencies } from "@config";

export type RatesType = { [k in (typeof currencies)[number]["value"]]: number };

export const useRates = () => {
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "common" });
  const [rates, setRates] = useState<RatesType>();

  useEffect(() => {
    (async () => {
      try {
        const data = await api.rates.current();
        setRates(data.rates as RatesType);
      } catch (e) {
        console.log(e)
        toast.show(t("unableGetRates"), { type: "error" });
      }
    })();
  }, []);

  return rates;
};
