import { CreateFunction } from "@utils/wallet/types";

export const createTransaction: CreateFunction = (
  _props: CreateTransactionParams
) => {
  return { txHex: "" };
};
