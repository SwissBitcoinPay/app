import { CreateFunction, CreateTransactionParams, CreateTransactionReturn } from "@utils/wallet/types";

export const createTransaction: CreateFunction = async (
  _props: CreateTransactionParams
): Promise<CreateTransactionReturn | undefined> => {
  return { txHex: "", psbt: _props.psbt };
};
