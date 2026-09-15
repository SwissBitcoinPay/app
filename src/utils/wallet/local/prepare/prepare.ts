import { keyStoreMnemonicWords } from "@config/settingsKeys";
import { AsyncStorage } from "@utils/AsyncStorage";
// @ts-ignore
import BIP84 from "bip84";
import { XOR } from "ts-essentials";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";
import { AskWordsPassword } from "@config/SBPAskPasswordModalContext/SBPAskPasswordModalContext";
import { getBitcoinNetwork } from "@config";

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

  const { isTestnet } = getBitcoinNetwork();

  // `isTestnet=true` aligne :
  //   - le coin_type BIP44 (1 au lieu de 0) → dérivation à m/84'/1'/0'
  //   - le préfixe WIF des private keys (`0xef` au lieu de `0x80`)
  // sinon `ECPair.fromWIF(wif, networks.testnet)` throw "Invalid network version".
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const root = new BIP84.fromMnemonic(mnemonic, undefined, isTestnet);

  const masterFingerprint = isTestnet
    ? root.pubTypes.testnet.vpub
    : root.pubTypes.mainnet.zpub;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const child0 = root.deriveAccount(0);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const bip84Account: Bip84PrivateAccount = new BIP84.fromZPrv(child0);

  return { bip84Account, masterFingerprint };
};
