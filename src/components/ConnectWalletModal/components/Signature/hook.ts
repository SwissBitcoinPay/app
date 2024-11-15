import { sleep } from "@utils";
import { useCallback } from "react";
import {
  ScriptType,
  getAccounts as getBitboxAccounts,
  getInfo,
  signAddress as bitboxSignMessage,
  AddressSignResponse,
  getReceiveAddressList
} from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";

export const useSignature = (error: (msg: string) => void) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

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
              const signingConfiguration = a.signingConfigurations.find(
                (e) => e.bitcoinSimple?.keyInfo.keypath.startsWith("m/84'/0'")
              );
              return {
                label: accounts[i].name,
                account: accounts[i].code,
                path: signingConfiguration?.bitcoinSimple.keyInfo.keypath,
                zpub: signingConfiguration?.bitcoinSimple.keyInfo.xpub
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

  const getAccountFirstAddress = useCallback(
    async (scriptType: ScriptType, account: string) => {
      try {
        const receiveAddressList = await getReceiveAddressList(account);
        if (receiveAddressList) {
          return receiveAddressList.find((v) => v.scriptType === scriptType)
            .addresses[0].address;
        }
      } catch (e) {}
      error(t("cannotGetAccount"));
    },
    [error, t]
  );

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

  return { getAccounts, getAccountFirstAddress, signMessage };
};
