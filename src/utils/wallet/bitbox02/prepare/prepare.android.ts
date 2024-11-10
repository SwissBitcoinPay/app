import { getInfo } from "@utils/Bitbox/api/account";
import { PrepareFunction } from "@utils/wallet/types";
import { DEFAULT_SCRIPT_TYPE } from "@config";

export const prepareTransaction: PrepareFunction = async ({ account }) => {
  const accountInfo = await getInfo(account);

  const masterFingerprint = accountInfo?.signingConfigurations.find(
    (v) => v.bitcoinSimple.scriptType === DEFAULT_SCRIPT_TYPE
  )?.bitcoinSimple.keyInfo.rootFingerprint;

  return { masterFingerprint };
};
