import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription, Loader } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { SBPBitboxContext, apiRootUrl } from "@config";
import { useSignature } from "./hook";
import * as ConnectStyled from "../../styled";
import { DEFAULT_SCRIPT_TYPE } from "@config";

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
    "getAccount" | "prepareSignature" | "waitingForSignature"
  >("getAccount");

  const { setAttentionToBitbox, pairedBitbox } = useContext(SBPBitboxContext);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const { getAccounts, getAccountXpub, signMessage } = useSignature(error);

  useEffect(() => {
    (async () => {
      const accounts = await getAccounts();
      setState("prepareSignature");
      const account = accounts[0];

      const accountXpub = await getAccountXpub(account);
      setValue("zPub", accountXpub);

      let success = false;
      let messageToSign: string;
      let signature: string;

      if (!customFunction) {
        const { data: verifyData } = await axios.post<{
          message: string;
        }>(`${apiRootUrl}/verify-address`, {
          depositAddress: accountXpub
        });
        messageToSign = verifyData.message;
      } else {
        setState("waitingForSignature");
        setAttentionToBitbox(true);

        const customSignatureData = await customFunction({
          bitbox: pairedBitbox,
          account,
          xPub: accountXpub
        });
        if (customSignatureData) {
          messageToSign = customSignatureData.messageToSign;
        }
      }

      try {
        if (messageToSign) {
          setState("waitingForSignature");
          setAttentionToBitbox(true);
          while (!signature) {
            const signatureData = await signMessage(
              DEFAULT_SCRIPT_TYPE,
              messageToSign,
              accounts[0]
            );

            if (signatureData.success) {
              signature = signatureData.signature;
            } else {
              error(t("signatureError"));

              if (signatureData.errorCode !== "userAbort") {
                setAttentionToBitbox(false);
                return;
              }
            }
          }

          setValue("message", messageToSign);
          setValue("signature", signature);

          success = true;
        }
      } catch (e) {}

      setAttentionToBitbox(false);
      onClose(success);
    })();
  }, []);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      {state !== "waitingForSignature" ? (
        <Loader reason={t(state)} />
      ) : (
        <FieldDescription style={{ textAlign: "center" }}>
          {t("waitingForSignature")}
        </FieldDescription>
      )}
    </ComponentStack>
  );
};
