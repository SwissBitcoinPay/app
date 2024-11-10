import { sleep } from "@utils";
import { useCallback } from "react";
import {
  ScriptType,
  getAccounts as getBitboxAccounts,
  getInfo,
  signAddress as bitboxSignMessage,
  AddressSignResponse
} from "@utils/Bitbox/api/account";
import { useTranslation } from "react-i18next";

export const useBitboxSignature = (error: (msg: string) => void) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature"
  });

  const getAccounts = useCallback(async () => {
    let accountCode: string;

    while (!accountCode) {
      await sleep(500);
      const accounts = await getBitboxAccounts();

      // TODO: Ask which account to use if have multiple ones already registered
      if (accounts.length > 0) {
        accountCode = accounts[0].code;
      }
    }
    return [accountCode];
  }, []);

  const getAccountFirstAddress = useCallback(
    async (account: string) => {
      const accountInfo = await getInfo(account);
      if (!accountInfo?.signingConfigurations) {
        error(t("cannotGetAccount"));
        return;
      }

      const accountZpub = accountInfo.signingConfigurations.find(
        (e) => e.bitcoinSimple?.keyInfo.keypath.startsWith("m/84'/0'")
      )?.bitcoinSimple?.keyInfo.xpub;

      if (!accountZpub) {
        error(t("cannotGetXpub"));
        return;
      }

      return accountZpub;
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
