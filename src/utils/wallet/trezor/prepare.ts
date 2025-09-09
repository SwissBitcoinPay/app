import { PrepareFunction, PrepareTransactionParams, PrepareTransactionReturn } from "@utils/wallet/types";

export const prepareTransaction: PrepareFunction = async (
  _params: PrepareTransactionParams
): Promise<PrepareTransactionReturn> => {
  return { masterFingerprint: "" };
};
