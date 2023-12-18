import { useEffect, useState } from "react";
import axios from "axios";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";

export const useRates = () => {
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "common" });
  const [rates, setRates] =
    useState<{ [k in string]: { [key in string]: number } }>();

  useEffect(() => {
    (async () => {
      try {
        const { data: getRatesData } = await axios.get<{
          data: typeof rates;
        }>("https://api.opennode.com/v1/rates");
        setRates(getRatesData.data);
      } catch (e) {
        toast.show(t("unableGetRates"), { type: "error" });
      }
    })();
  }, []);

  return rates;
};
