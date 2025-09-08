import { useCallback } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";
import { AppClient } from "ledger-bitcoin";
// @ts-ignore
import BIP84 from "bip84";
import axios from "axios";
import { Bip84Account, MempoolTX } from "@types";
import { UseSignatureParams } from "./useSignature";
import xpubConverter from "xpub-converter";
import Btc from "@ledgerhq/hw-app-btc";
import Transport from "@ledgerhq/hw-transport";

const ROOT_PATH = `84'/0'`;

export type UseSignatureParams = {
  wallet?: Btc;
  transport?: Transport;
  error: (msg: string) => void;
};

export const useSignature = ({
  wallet,
  transport,
  error
}: UseSignatureParams) => {
  const getAccounts = useCallback(async () => {
    if (wallet && transport) {
      try {
        const accounts = [];
        let index = 0;

        while (true) {
          const path = `${ROOT_PATH}/${index}'`;

          const accountXpub = await wallet.getWalletXpub({
            path,
            xpubVersion: 0x0488b21e
          });

          const app = new AppClient(transport);
          const masterFingerprint = await app.getMasterFingerprint();

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const zpub: string = xpubConverter(accountXpub, "zpub");

          accounts.push({
            label: `Bitcoin ${index + 1}`,
            account: path,
            path: `m/${path}`,
            zpub,
            fingerprint: masterFingerprint
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const bip84Account: Bip84Account = new BIP84.fromZPub(zpub);

          const firstAddress = bip84Account.getAddress(0);

          const { data: addressTxs } = await axios.get<MempoolTX[]>(
            `https://mempool.space/api/address/${firstAddress}/txs`
          );

          if (addressTxs.length === 0) {
            return accounts;
          }

          index += 1;
        }
      } catch (e) {
        error(e.message as string);
      }
    }
  }, [error, wallet]);

  const signMessage = useCallback(
    async (format: ScriptType, message: string, account: string) => {
      try {
        const signatureData = await wallet.signMessage(
          `${account}/0/0`,
          Buffer.from(message).toString("hex")
        );

        const v = signatureData.v + 27 + 4;
        const signature = Buffer.from(
          v.toString(16) + signatureData.r + signatureData.s,
          "hex"
        ).toString("base64");

        return {
          success: true,
          signature: signature
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
