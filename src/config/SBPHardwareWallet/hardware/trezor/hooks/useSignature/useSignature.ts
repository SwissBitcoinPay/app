import { useCallback } from "react";
import { ScriptType } from "@utils/Bitbox/api/account";
// @ts-ignore
import BIP84 from "bip84";
import axios from "axios";
import { Bip84Account } from "@types";
// @ts-ignore
import xpubConverter from "xpub-converter";
import TrezorConnect from "@trezor/connect-web";
import { WalletTransaction } from "@screens/Wallet/Wallet";

const ROOT_PATH = `m/84'/0'`;

export type UseSignatureParams = {
  error: (msg: string) => void;
  getPublicKeyFn: typeof TrezorConnect.getPublicKey;
  signMessageFn: typeof TrezorConnect.signMessage;
};

export const useSignature = ({
  error,
  getPublicKeyFn,
  signMessageFn
}: UseSignatureParams) => {
  const getAccounts = useCallback(async () => {
    const GET_ACCOUNTS_GAP = 5;

    const accounts = [];
    let index = 0;

    const trezorAccounts = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (index % GET_ACCOUNTS_GAP === 0) {
        const response = await getPublicKeyFn({
          keepSession: true,
          bundle: Array.from({ length: GET_ACCOUNTS_GAP }, (_, i) => ({
            path: `${ROOT_PATH}/${index + i}'`,
            coin: "btc"
          }))
        });

        if (!response.success) {
          console.error("Error exporting trezorAccounts", { response });
          return;
        }

        trezorAccounts.push(...response.payload);
      }

      const account = trezorAccounts[index];
      const path = account.serializedPath;
      const accountZpub =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        account.xpubSegwit || xpubConverter(account.xpub, "zpub");

      const newAccount = {
        label: `Bitcoin ${index + 1}`,
        account: path,
        path,
        fingerprint: account.fingerprint.toString(16).padStart(8, "0"),
        zpub: accountZpub
      };

      accounts.push(newAccount);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const bip84Account: Bip84Account = new BIP84.fromZPub(accountZpub);

      const firstAddress = bip84Account.getAddress(0);

      const { data: addressTxs } = await axios.get<{
        txs: WalletTransaction[];
      }>(`https://stats.swiss-bitcoin-pay.ch/txs/${firstAddress}`);

      if (addressTxs.txs.length === 0) {
        return accounts;
      }

      index += 1;
    }
  }, [error]);

  const signMessage = useCallback(
    async (format: ScriptType, message: string, account: string) => {
      try {
        const signatureData = await signMessageFn({
          path: `${account}/0/0`,
          message: message
        });

        if (!signatureData.success) {
          return signatureData;
        }

        return {
          success: true,
          signature: signatureData.payload.signature
        };
      } catch (e) {
        console.error("Error signing message with Trezor", e);
        return { success: false };
      }
    },
    []
  );

  return {
    getAccounts,
    signMessage
  };
};
