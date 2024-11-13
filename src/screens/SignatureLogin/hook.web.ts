import { SBPBitboxContext } from "@config";
import jseu from "js-encoding-utils";
import { useCallback, useContext } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";

const uint8ArrayToBase64 = (uint8Array: Uint8Array) => {
  return Buffer.from(uint8Array).toString("base64");
};

export const useBitboxSignature = (error: (msg: string) => void) => {
  const { pairedBitbox } = useContext(SBPBitboxContext);
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const getAccounts = useCallback(() => {
    return [`m/84'/0'/0'`];
  }, []);

  const getAccountFirstAddress = useCallback(
    async (format: ScriptType, account: string) => {
      try {
        if (pairedBitbox) {
          const firstAddress = await pairedBitbox.btcAddress(
            "btc",
            `${account}/0/0`,
            { simpleType: format }
          );
          return firstAddress;
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

  return { getAccounts, getAccountFirstAddress, signMessage };
};
