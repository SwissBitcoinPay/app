import jseu from "js-encoding-utils";
import { useCallback } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
// @ts-ignore
import BIP84 from "bip84";
import axios from "axios";
import { Bip84Account, MempoolTX } from "@types";
import { UseSignatureParams } from "./useSignature";

const uint8ArrayToBase64 = (uint8Array: Uint8Array) => {
  return Buffer.from(uint8Array).toString("base64");
};

const ROOT_PATH = `m/84'/0'`;

export const useSignature = ({ wallet }: UseSignatureParams) => {
  const getAccounts = useCallback(async () => {
    const accounts = [];
    let index = 0;

    while (true) {
      const path = `${ROOT_PATH}/${index}'`;

      const accountXpub = await wallet.btcXpub("btc", path, "zpub", false);
      const rootFingerprint = await wallet.rootFingerprint();

      accounts.push({
        label: `Bitcoin ${index + 1}`,
        account: path,
        path,
        zpub: accountXpub,
        fingerprint: rootFingerprint
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
  }, [wallet]);

  const signMessage = useCallback(
    async (format: ScriptType, message: string, account: string) => {
      try {
        const signatureData = await wallet.btcSignMessage(
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
    [wallet]
  );

  return {
    getAccounts,
    signMessage
  };
};
