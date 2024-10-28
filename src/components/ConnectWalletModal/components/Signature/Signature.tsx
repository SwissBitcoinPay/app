import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription, Loader } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { SBPBitboxContext, apiRootUrl } from "@config";
import { useSignature } from "./hook";
import * as ConnectStyled from "../../styled";

export const Signature = ({
  setValue,
  onClose
}: ConnectWalletComponentProps) => {
  const toast = useToast();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const [state, setState] = useState<
    | "getAccount"
    | "prepareSignature"
    | "waitingForSignature"
    | "verifySignature"
  >("getAccount");

  const { setAttentionToBitbox } = useContext(SBPBitboxContext);

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
      const accountXpub = await getAccountXpub(accounts[0]);
      setValue("zPub", accountXpub);

      const { data: verifyData } = await axios.post<{
        message: string;
        signAddress?: string;
      }>(`${apiRootUrl}/verify-address`, {
        depositAddress: accountXpub
      });

      let signature: string;

      setState("waitingForSignature");
      setAttentionToBitbox(true);
      while (!signature) {
        const signatureData = await signMessage(
          "p2wpkh",
          verifyData.message,
          accounts[0]
        );

        if (signatureData.success) {
          signature = signatureData.signature;
        } else {
          error(t("signatureError"));

          if (signatureData.errorCode !== "userAbort") {
            return;
          }
        }
      }

      setAttentionToBitbox(false);
      setState("verifySignature");

      const message = verifyData.message;

      setValue("message", message);
      setValue("signature", signature);

      await axios.post(`${apiRootUrl}/verify-signature`, {
        message,
        signature
      });

      onClose(true);
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
