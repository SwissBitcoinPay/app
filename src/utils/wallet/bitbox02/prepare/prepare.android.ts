import { getInfo } from "@utils/Bitbox/api/account";
import { PrepareFunction, PrepareTransactionParams, PrepareTransactionReturn } from "@utils/wallet/types";
import { DEFAULT_SCRIPT_TYPE } from "@config";

export const prepareTransaction: PrepareFunction = async ({ account }: PrepareTransactionParams): Promise<PrepareTransactionReturn> => {
  if (!account) {
    throw new Error("Account is required for Android BitBox02");
  }
  
  const accountInfo = await getInfo(account);

  const masterFingerprint = accountInfo?.signingConfigurations.find(
    (v) => v.bitcoinSimple.scriptType === DEFAULT_SCRIPT_TYPE
  )?.bitcoinSimple.keyInfo.rootFingerprint;

  if (!masterFingerprint) {
    throw new Error("Master fingerprint not found");
  }

  return { masterFingerprint };
};
