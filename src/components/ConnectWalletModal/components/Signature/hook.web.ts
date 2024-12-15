import { SBPBitboxContext } from "@config";
import jseu from "js-encoding-utils";
import { useCallback, useContext } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";
// @ts-ignore
import BIP84 from "bip84";
import axios from "axios";
import { Bip84Account, MempoolTX } from "@types";

const uint8ArrayToBase64 = (uint8Array: Uint8Array) => {
  return Buffer.from(uint8Array).toString("base64");
};

const ROOT_PATH = `m/84'/0'`;

export const useSignature = (error: (msg: string) => void) => {
  const { pairedBitbox } = useContext(SBPBitboxContext);
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const getAccounts = useCallback(async () => {
    const accounts = [];
    let index = 0;

    while (true) {
      const path = `${ROOT_PATH}/${index}'`;

      const accountXpub = await pairedBitbox.btcXpub(
        "btc",
        path,
        "zpub",
        false
      );

      accounts.push({
        label: `Bitcoin ${index + 1}`,
        account: path,
        path,
        zpub: accountXpub
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const bip84Account: Bip84Account = new BIP84.fromZPub(accountXpub);

      const firstAddress = bip84Account.getAddress(0);

      const { data: addressTxs } = await axios.get<MempoolTX[]>(
        `https://mempool.space/api/address/${firstAddress}/txs`
      );

      if (addressTxs.length === 0) {
        return accounts;
      }

      index += 1;
    }
  }, [pairedBitbox]);

  const getAccountFirstAddress = useCallback(
    async (format: ScriptType, account: string) => {
      try {
        if (pairedBitbox) {
          const firstAddress = await pairedBitbox.btcAddress(
            "btc",
            `${account}/0/0`,
            { simpleType: format },
            false
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

  return {
    getAccounts,
    getAccountFirstAddress,
    signMessage
  };
};
