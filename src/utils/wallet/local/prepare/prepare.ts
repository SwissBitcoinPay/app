import { keyStoreMnemonicWords } from "@config/settingsKeys";
import { AsyncStorage } from "@utils/AsyncStorage";
// @ts-ignore
import BIP84 from "bip84";
import { XOR } from "ts-essentials";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";
import { AskWordsPassword } from "@config/SBPAskPasswordModalContext/SBPAskPasswordModalContext";

export type PrepareTransactionParams = XOR<
  {
    bitbox: PairedBitBox;
  },
  {
    accountCode: string;
  }
> & {
  askWordsPassword?: AskWordsPassword;
};

export type PrepareTransactionReturn = {
  bip84Account: Bip84PrivateAccount;
  masterFingerprint: string;
};

export const prepareTransaction = async (
  params: PrepareTransactionParams
): Promise<PrepareTransactionReturn> => {
  let encryptionKey;

  if (params.askWordsPassword) {
    encryptionKey = await params.askWordsPassword();
  }
  const mnemonic = await AsyncStorage.getItem(
    keyStoreMnemonicWords,
    undefined,
    encryptionKey
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const root = new BIP84.fromMnemonic(mnemonic);

  const masterFingerprint = root.pubTypes.mainnet.zpub;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const child0 = root.deriveAccount(0);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const bip84Account: Bip84PrivateAccount = new BIP84.fromZPrv(child0);

  return { bip84Account, masterFingerprint };
};
