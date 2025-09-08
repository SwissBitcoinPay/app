import { Psbt } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import { FormattedUtxo, WalletTransaction } from "@screens/Wallet/Wallet";
import { Bip84PrivateAccount } from "@types";
import { DEFAULT_NETWORK } from "@config";

const ECPair = ECPairFactory(ecc);

type CreateTransactionParams = {
  psbt: Psbt;
  usedUtxos: FormattedUtxo[];
  bip84Account: Bip84PrivateAccount;
};

export const createTransaction = ({
  psbt,
  usedUtxos,
  bip84Account
}: CreateTransactionParams) => {
  usedUtxos.forEach((utxo, index) => {
    const privateKeyWIF = bip84Account.getPrivateKey(
      utxo.addressIndex,
      utxo.change
    );
    psbt.signInput(index, ECPair.fromWIF(privateKeyWIF, DEFAULT_NETWORK));
  });

  psbt.finalizeAllInputs();
  return { txHex: psbt.extractTransaction().toHex(), psbt };
};
