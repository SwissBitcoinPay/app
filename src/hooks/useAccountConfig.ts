import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  keyStoreAccountConfig,
  keyStoreDeviceName,
  keyStoreHmac,
  keyStoreIsGuest
} from "@config/settingsKeys";
import { AsyncStorage } from "@utils";
import { useNavigate } from "@components/Router";
import { useToast } from "react-native-toast-notifications";
import { AccountConfigType, UserType } from "@types";
import { useTranslation } from "react-i18next";
import { apiRootUrl, appRootUrl, SBPContext } from "@config";
import { api, client } from "@types";
import axios from "axios";
import {
  getAccountApiAuth,
  getAccountRefreshApiKey
} from "./getAccountApiAuth";

const oldAppRootUrl = "https://checkout.swiss-bitcoin-pay.ch";

const parseActivationLink = (scannedValue: string) => {
  try {
    const activationUrl = new URL(scannedValue);
    const isSupportedOrigin = [appRootUrl, oldAppRootUrl].some(
      (rootUrl) => activationUrl.origin === new URL(rootUrl).origin
    );
    const activationPath = activationUrl.pathname.match(
      /^\/connect\/([^/]+)$/
    );

    if (!isSupportedOrigin || !activationPath) {
      return;
    }

    return {
      activationKey: decodeURIComponent(activationPath[1]),
      deviceName: activationUrl.searchParams.get("deviceName") ?? undefined,
      hmac: activationUrl.searchParams.get("hmac") ?? undefined,
      isGuest: activationUrl.searchParams.has("isGuest")
    };
  } catch {
    return;
  }
};

type UseAccountConfigParams = {
  refresh?: boolean;
  listenAppState?: boolean;
};

export const useAccountConfig = (props?: UseAccountConfigParams) => {
  const { refresh = true, listenAppState = false } = props || {};
  const navigate = useNavigate();
  const { accountConfig, setUserType, setAccountConfig } =
    useContext(SBPContext);

  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "accountConfigHook" });

  const validateApiKey = useCallback(
    async (testApiKey?: string) => {
      let _accountConfig: AccountConfigType;
      try {
        const data = await api.accounts.me(getAccountApiAuth(testApiKey));

        _accountConfig = {
          ...data,
          invoice_key: testApiKey || data.invoice_key
        };

        await AsyncStorage.setItem(
          keyStoreAccountConfig,
          JSON.stringify(_accountConfig)
        );

        const hmacSecret = (data as { hmac_secret?: unknown }).hmac_secret;
        if (
          typeof hmacSecret === "string" &&
          (data.is_checkout_secure || data.is_atm)
        ) {
          await AsyncStorage.setItem(keyStoreHmac, hmacSecret);
        }

        setAccountConfig(_accountConfig);
      } catch (e) {
        setIsLoading(false);
        return false;
      }
      setIsLoading(false);
      return _accountConfig;
    },
    [setAccountConfig]
  );

  // Les comptes admin possèdent aussi une invoice_key. Ne pas l'envoyer lors
  // d'un refresh JWT, sinon le backend retourne la vue API-key partielle.
  const refreshAccountConfig = useCallback(
    (apiKey?: string) =>
      validateApiKey(
        getAccountRefreshApiKey(apiKey, client.tokens() !== undefined)
      ),
    [validateApiKey]
  );

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (listenAppState && accountConfig?.invoice_key && AppState.isAvailable) {
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active"
          ) {
            void refreshAccountConfig(accountConfig.invoice_key);
          }

          appState.current = nextAppState;
        }
      );

      return () => subscription.remove();
    }
  }, [listenAppState, accountConfig?.invoice_key, refreshAccountConfig]);

  const onScan = useCallback(
    async (scannedValue: string) => {
      setIsLoading(true);
      const activationLink = parseActivationLink(scannedValue);

      if (activationLink) {
        const validatedAccountConfig = await validateApiKey(
          activationLink.activationKey
        );
        if (validatedAccountConfig) {
          if (activationLink.deviceName !== undefined) {
            await AsyncStorage.setItem(
              keyStoreDeviceName,
              activationLink.deviceName
            );
          }
          const hasServerHmac =
            typeof validatedAccountConfig.hmac_secret === "string" &&
            (validatedAccountConfig.is_checkout_secure ||
              validatedAccountConfig.is_atm);
          if (activationLink.hmac !== undefined && !hasServerHmac) {
            await AsyncStorage.setItem(keyStoreHmac, activationLink.hmac);
          }
          if (activationLink.isGuest) {
            await AsyncStorage.setItem(keyStoreIsGuest, "true");
          }
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
      apiKey = parsedConfig.invoice_key;
    }

    if (refresh && !(await refreshAccountConfig(apiKey))) {
      toast.show(t("checkInternet"), {
        type: "error"
      });
    }
  }, [setAccountConfig, refresh, refreshAccountConfig, toast, t]);

  const onQrLogin = useCallback(
    async (qrValue: string) => {
      if (await onScan(qrValue)) {
        // Une activation Employé peut être scannée depuis une session Admin.
        // Supprimer alors le JWT pour que les prochains refresh continuent
        // d'utiliser la clé d'encaissement qui vient d'être validée.
        if (client.tokens() !== undefined) {
          await client.logout();
        }
        setUserType(UserType.Employee);
        toast.show(t("setupComplete"), { type: "success" });
        return true;
      }
      return false;
    },
    [onScan, setUserType, t, toast]
  );

  const onAuthLogin = useCallback(
    async (
      loginData: { email: string; password: string },
      withSuccessToast = false,
      withNavigate = true
    ) => {
      await client.login(loginData.email, loginData.password);
      const _accountConfig = await validateApiKey();

      if (withSuccessToast) {
        toast.show(t("setupComplete"), { type: "success" });
      }
      if (withNavigate) {
        navigate("/");
      }
      return _accountConfig;
    },
    [navigate, t, toast, validateApiKey]
  );

  // Connexion par signature Bitcoin. Le back-end est un fournisseur d'identité
  // OIDC : il n'émet pas la session lui-même, il atteste seulement « cette
  // personne possède la clé privée de cette adresse », et c'est le serveur d'API qui
  // ouvre la session (cf. l'endpoint `signature_auth` côté serveur).
  //
  // Trois étapes, dans cet ordre :
  //   1. `/v1/signature-auth/verify` échange la preuve de signature contre un
  //      ticket à usage unique, posé en cookie HttpOnly (120 s) — il ne peut pas
  //      être lu en JS, d'où `withCredentials` sur les deux appels suivants ;
  //   2. le flux OAuth natif consomme ce ticket et pose les cookies de session ;
  //   3. le SDK adopte la session en interrogeant `/api/auth/v1/status`
  //      (`checkCookies`) — un appel serveur, donc valable aussi en natif où il
  //      n'existe pas de `document.cookie`.
  const onSignatureLogin = useCallback(
    async (
      proof: { message: string; signature: string },
      withNavigate = true
    ) => {
      await axios.post(`${apiRootUrl}/v1/signature-auth/verify`, proof, {
        withCredentials: true
      });
      await axios.get(`${apiRootUrl}/api/auth/v1/oauth/oidc0/login`, {
        withCredentials: true
      });
      await client.checkCookies();

      const _accountConfig = await validateApiKey();
      if (withNavigate) {
        navigate("/");
      }
      return _accountConfig;
    },
    [navigate, validateApiKey]
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
    onSignatureLogin,
    // @ts-ignore
    // eslint-disable-next-line no-extra-boolean-cast
    ...(!!toast.show ? { onQrLogin } : {})
  };
};
