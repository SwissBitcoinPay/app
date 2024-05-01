import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  keyStoreAccountConfig,
  keyStoreDeviceName,
  keyStoreHmac
} from "@config/settingsKeys";
import { AsyncStorage } from "@utils";
import { useNavigate } from "@components/Router";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { AccountConfigType, UserType } from "@types";
import { useTranslation } from "react-i18next";
import { apiRootUrl, appRootUrl, SBPContext } from "@config";

const oldAppRootUrl = "https://checkout.swiss-bitcoin-pay.ch";

type UseAccountConfigParams = {
  refresh?: boolean;
};

export const useAccountConfig = (props?: UseAccountConfigParams) => {
  const { refresh = true } = props || {};
  const navigate = useNavigate();
  const { accountConfig, setUserType, setAccountConfig } =
    useContext(SBPContext);

  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "accountConfigHook" });

  const validateApiKey = useCallback(
    async (testApiKey?: string) => {
      try {
        const { data } = await axios.get<AccountConfigType>(
          `${apiRootUrl}/account-v3`,
          {
            withCredentials: true,
            headers: { "Api-Key": testApiKey }
          }
        );

        const fullConfig = { ...data, apiKey: testApiKey || data.apiKey };

        await AsyncStorage.setItem(
          keyStoreAccountConfig,
          JSON.stringify(fullConfig)
        );

        if (typeof data.hmacSecret === "string" && data.isCheckoutSecure) {
          await AsyncStorage.setItem(keyStoreHmac, data.hmacSecret);
        }

        setAccountConfig(fullConfig);
      } catch (e) {
        setIsLoading(false);
        return false;
      }
      setIsLoading(false);
      return true;
    },
    [setAccountConfig]
  );

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (accountConfig?.apiKey && AppState.isAvailable) {
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active"
          ) {
            void validateApiKey(accountConfig.apiKey);
          }

          appState.current = nextAppState;
        }
      );

      return () => subscription.remove();
    }
  }, [accountConfig?.apiKey]);

  const onScan = useCallback(
    async (scannedValue: string) => {
      setIsLoading(true);
      if (
        scannedValue.startsWith(`${appRootUrl}/connect/`) ||
        scannedValue.startsWith(`${oldAppRootUrl}/connect/`)
      ) {
        const arr = scannedValue.split("/");
        const activationPart = arr.pop();
        const path = arr.pop();

        if (path === "connect") {
          const activationPartArr = activationPart?.split("?") || [];

          if (activationPartArr?.length > 1) {
            const extraValuesArr = activationPartArr?.pop()?.split("&");

            while (extraValuesArr?.length) {
              const [key, value] = (extraValuesArr.pop() as string).split("=");
              if (key === "deviceName") {
                await AsyncStorage.setItem(keyStoreDeviceName, value);
              } else if (key === "hmac") {
                await AsyncStorage.setItem(keyStoreHmac, value);
              }
            }
          }
          scannedValue = activationPartArr?.pop() || "";
        }
        if (await validateApiKey(scannedValue)) {
          setIsLoading(false);
          return true;
        }
      }

      setIsLoading(false);
      toast.show(t("invalidActivationCode"), {
        type: "error"
      });

      return false;
    },
    [t, toast, validateApiKey]
  );

  const loadConfigFromStorage = useCallback(async () => {
    const storeAccountconfig = await AsyncStorage.getItem(
      keyStoreAccountConfig
    );

    let apiKey;
    if (storeAccountconfig) {
      const parsedConfig = JSON.parse(storeAccountconfig) as AccountConfigType;
      setAccountConfig(parsedConfig);
      apiKey = parsedConfig.apiKey;
    }

    if (refresh && !(await validateApiKey(apiKey))) {
      toast.show(t("checkInternet"), {
        type: "error"
      });
    }
  }, [setAccountConfig, refresh, validateApiKey, toast, t]);

  const onQrLogin = useCallback(
    async (qrValue: string) => {
      if (await onScan(qrValue)) {
        setUserType(UserType.Employee);
        toast.show(t("setupComplete"), { type: "success" });
        return true;
      }
      return false;
    },
    [onScan, setUserType, t, toast]
  );

  const onAuthLogin = useCallback(
    async (loginData: unknown, withSuccessToast = false) => {
      await axios.post(`${apiRootUrl}/auth`, loginData, {
        withCredentials: true
      });
      await validateApiKey();

      if (withSuccessToast) {
        toast.show(t("setupComplete"), { type: "success" });
      }
      navigate("/");
    },
    [navigate, t, toast, validateApiKey]
  );

  useEffect(() => {
    (async () => {
      await loadConfigFromStorage();
      setIsLoading(false);
    })();
  }, []);

  return {
    isLoading,
    accountConfig,
    setAccountConfig,
    onAuthLogin,
    // @ts-ignore
    // eslint-disable-next-line no-extra-boolean-cast
    ...(!!toast.show ? { onQrLogin } : {})
  };
};
