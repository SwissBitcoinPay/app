import { useEffect } from "react";
import { useSearchParams } from "@components/Router";
import { AsyncStorage } from "@utils";
import { keyStoreRefCode } from "@config/settingsKeys";

export const useRefCode = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const fn = async () => {
      const refCode = searchParams.get("refCode");

      if (refCode) {
        await AsyncStorage.setItem(keyStoreRefCode, refCode);
      }
    };
    fn();
  }, []);

  return null;
};
