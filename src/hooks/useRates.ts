import { useEffect, useState } from "react";
import axios from "axios";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import { apiRootUrl, currencies } from "@config";

export type RatesType = { [k in (typeof currencies)[number]["value"]]: number };

export const useRates = () => {
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "common" });
  const [rates, setRates] = useState<RatesType>();

  useEffect(() => {
    (async () => {
      try {
        const { data: getRatesData } = await axios.get<RatesType>(
          `${apiRootUrl}/rates`
        );
        setRates(getRatesData);
      } catch (e) {
        toast.show(t("unableGetRates"), { type: "error" });
      }
    })();
  }, []);

  return rates;
};
