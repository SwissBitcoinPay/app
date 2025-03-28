import { PrepareFunction } from "@utils/wallet/types";
import { AppClient } from "ledger-bitcoin";

export const prepareTransaction: PrepareFunction = async ({
  hardwareWallet
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const app = new AppClient(hardwareWallet._transport);

  const masterFingerprint = await app.getMasterFingerprint();

  return { masterFingerprint };
};
