import { SBPBitboxContext } from "@config";
import jseu from "js-encoding-utils";
import { useCallback, useContext } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";

const uint8ArrayToBase64 = (uint8Array: Uint8Array) => {
  return Buffer.from(uint8Array).toString("base64");
};

export const useSignature = (error: (msg: string) => void) => {
  const { pairedBitbox } = useContext(SBPBitboxContext);
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const getAccounts = useCallback(() => {
    return [`m/84'/0'/0'`];
  }, []);

  const getAccountXpub = useCallback(
    async (account: string) => {
      try {
        if (pairedBitbox) {
          const accountXpub = await pairedBitbox.btcXpub(
            "btc",
            account,
            "zpub",
            false
          );
          return accountXpub;
        }
      } catch (e) {}
      error(t("cannotGetAccount"));
    },
    [error, pairedBitbox, t]
  );

  const signMessage = useCallback(
    async (format: ScriptType, message: string, account: string) => {
      try {
        const signatureData = await pairedBitbox.btcSignMessage(
          "btc",
          {
            scriptConfig: { simpleType: format },
            keypath: `${account}/0/0`
          },
          jseu.encoder.stringToArrayBuffer(message)
        );

        return {
          success: true,
          signature: uint8ArrayToBase64(signatureData.electrumSig65)
        };
      } catch (e) {
        return { success: false };
      }
    },
    [pairedBitbox]
  );

  return { getAccounts, getAccountXpub, signMessage };
};
