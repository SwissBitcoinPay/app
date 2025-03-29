import { PrepareFunction } from "@utils/wallet/types";
import { PairedBitBox } from "bitbox-api";

export const prepareTransaction: PrepareFunction = async ({
  hardwareWallet
}) => {
  const masterFingerprint = await (
    hardwareWallet as PairedBitBox
  ).rootFingerprint();
  return { masterFingerprint };
};
