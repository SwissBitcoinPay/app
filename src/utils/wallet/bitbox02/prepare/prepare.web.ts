import { PrepareFunction } from "@utils/wallet/types";

export const prepareTransaction: PrepareFunction = async ({ bitbox }) => {
  const masterFingerprint = await bitbox.rootFingerprint();
  return { masterFingerprint };
};
