import { PrepareFunction, PrepareTransactionParams, PrepareTransactionReturn } from "@utils/wallet/types";
import { AppClient } from "ledger-bitcoin";

export const prepareTransaction: PrepareFunction = async ({
  hardwareWallet
}: PrepareTransactionParams): Promise<PrepareTransactionReturn> => {
  if (!hardwareWallet) {
    throw new Error("Hardware wallet is required for Ledger");
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const app = new AppClient((hardwareWallet as any)._transport);

  const masterFingerprint = await app.getMasterFingerprint();

  return { masterFingerprint };
};
