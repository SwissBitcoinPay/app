import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ComponentStack, FieldDescription, Loader } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { apiRootUrl } from "@config";
import * as ConnectStyled from "../../styled";
import { DEFAULT_SCRIPT_TYPE } from "@config";
import * as S from "./styled";
import { AccountBalance } from "./components/AccountBalance";
import { keyStoreWalletPath } from "@config/settingsKeys";
import { AsyncStorage, hardwareNames } from "@utils";
import { SBPHardwareWalletContext } from "@config/SBPHardwareWallet";

export type Account = {
  label: string;
  account: string;
  path: string;
  zpub: string;
  balance: number;
};

export const Signature = ({
  setValue,
  onClose,
  customFunction
}: ConnectWalletComponentProps) => {
  const toast = useToast();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const [state, setState] = useState<
    "getAccount" | "selectAccount" | "prepareSignature" | "waitingForSignature"
  >("getAccount");

  const {
    setAttentionToHardware,
    getAccounts,
    signMessage,
    wallet,
    hardwareType
  } = useContext(SBPHardwareWalletContext);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const [promiseResolver, setPromiseResolver] = useState<Promise<string>>();

  const [accounts, setAccounts] = useState<Account[]>();

  useEffect(() => {
    (async () => {
      const _accounts = await getAccounts();

      if (!_accounts) {
        onClose();
        return;
      }

      const walletPath = await AsyncStorage.getItem(keyStoreWalletPath);

      let finalAccount: Account;

      if (walletPath) {
        finalAccount = _accounts.find((a) => a.path === walletPath);
      } else if (_accounts.length > 1) {
        const promise = new Promise<Account>((resolve) => {
          setPromiseResolver(() => resolve);
        });

        setAccounts(_accounts);
        setState("selectAccount");

        const result = await promise;

        finalAccount = result;
      } else {
        finalAccount = _accounts[0];
      }

      const { zpub: accountZpub, account, path } = finalAccount;
      setState("prepareSignature");
      setValue("zPub", accountZpub);
      setValue("path", path);

      let success = false;
      let messageToSign: string;
      let signature: string;

      if (!customFunction) {
        const { data: verifyData } = await axios.post<{
          message: string;
        }>(`${apiRootUrl}/verify-address`, {
          depositAddress: accountZpub
        });
        messageToSign = verifyData.message;
      } else {
        setState("waitingForSignature");

        setAttentionToHardware?.(true);

        const customSignatureData = await customFunction({
          wallet,
          account,
          xPub: accountZpub
        });
        if (customSignatureData) {
          messageToSign = customSignatureData.messageToSign;
        }
      }

      try {
        if (messageToSign) {
          setState("waitingForSignature");
          setAttentionToHardware?.(true);
          while (!signature) {
            const signatureData = await signMessage(
              DEFAULT_SCRIPT_TYPE,
              messageToSign,
              account
            );

            if (signatureData.success) {
              signature = signatureData.signature;
            } else {
              error(t("signatureError"));

              if (signatureData.errorCode !== "userAbort") {
                setAttentionToHardware?.(false);
                return;
              }
            }
          }

          setValue("message", messageToSign);
          setValue("signature", signature);

          success = true;
        }
      } catch (e) {}

      setAttentionToHardware?.(false);
      onClose(success);
    })();
  }, []);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      {state === "selectAccount" && accounts ? (
        <ComponentStack>
          <FieldDescription style={{ textAlign: "center" }}>
            {t("selectAccount")}
          </FieldDescription>
          <ComponentStack gapSize={16}>
            {accounts.map((a, i) => (
              <S.AccountContainer key={i}>
                <S.AccountInfoContainer>
                  <S.AccountTitle>
                    {a.label} <S.AccountSubTitle>{a.path}</S.AccountSubTitle>
                  </S.AccountTitle>
                  <AccountBalance xpub={a.zpub} />
                </S.AccountInfoContainer>
                <Button
                  size="small"
                  type="bitcoin"
                  title={t("select")}
                  onPress={() => {
                    if (promiseResolver) {
                      promiseResolver(a);
                    }
                  }}
                />
              </S.AccountContainer>
            ))}
          </ComponentStack>
        </ComponentStack>
      ) : state !== "waitingForSignature" ? (
        <Loader reason={t(state)} />
      ) : (
        <FieldDescription style={{ textAlign: "center" }}>
          {t("waitingForSignature", {
            hardwareWallet: hardwareNames[hardwareType]
          })}
        </FieldDescription>
      )}
    </ComponentStack>
  );
};
