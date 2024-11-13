import { keyStoreMnemonicWords } from "@config/settingsKeys";
import { AsyncStorage } from "@utils/AsyncStorage";
// @ts-ignore
import BIP84 from "bip84";
import { XOR } from "ts-essentials";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";

export type PrepareTransactionParams = XOR<
  {
    bitbox: PairedBitBox;
  },
  {
    accountCode: string;
  }
>;

export type PrepareTransactionReturn = {
  bip84Account: Bip84PrivateAccount;
  masterFingerprint: string;
};

export const prepareTransaction = async (
  _params: PrepareTransactionParams
): Promise<PrepareTransactionReturn> => {
  const mnemonic = await AsyncStorage.getItem(keyStoreMnemonicWords);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const root = new BIP84.fromMnemonic(mnemonic);

  const masterFingerprint = root.pubTypes.mainnet.zpub;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const child0 = root.deriveAccount(0);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const bip84Account: Bip84PrivateAccount = new BIP84.fromZPrv(child0);

  return { bip84Account, masterFingerprint };
};
