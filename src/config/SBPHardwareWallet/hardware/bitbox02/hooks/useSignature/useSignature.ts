import { sleep } from "@utils";
import { useCallback } from "react";
import {
  ScriptType,
  getAccounts as getBitboxAccounts,
  getInfo,
  signAddress as bitboxSignMessage,
  AddressSignResponse
} from "@utils/Bitbox/api/account";
import { PairedBitBox } from "bitbox-api";

export type UseSignatureParams = {
  wallet: PairedBitBox;
  error: (msg: string) => void;
};

export const useSignature = () => {
  const getAccounts = useCallback(async () => {
    try {
      while (true) {
        await sleep(500);
        const accounts = await getBitboxAccounts();

        if (accounts.length > 0) {
          const accountsPromises = accounts.map((a) => getInfo(a.code));

          const accountsInfo = await Promise.all(accountsPromises);

          const allAccountsWithZpub = accountsInfo
            .map((a, i) => {
              const signingConfiguration = a.signingConfigurations.find((e) =>
                e.bitcoinSimple?.keyInfo.keypath.startsWith("m/84'/0'")
              );

              return {
                label: accounts[i].name,
                account: accounts[i].code,
                path: signingConfiguration?.bitcoinSimple.keyInfo.keypath,
                zpub: signingConfiguration?.bitcoinSimple.keyInfo.xpub,
                fingerprint:
                  signingConfiguration?.bitcoinSimple.keyInfo.rootFingerprint
              };
            })
            .filter((v) => v.zpub);

          return allAccountsWithZpub;
        }
      }
    } catch (e) {
      console.error(e);
    }

    return [];
  }, []);

  const signMessage = useCallback(
    async (format: ScriptType, message: string, account: string) => {
      try {
        const signatureData = await bitboxSignMessage(format, message, account);
        return signatureData;
      } catch (e) {
        return { success: false } as AddressSignResponse;
      }
    },
    []
  );

  return { getAccounts, signMessage };
};
