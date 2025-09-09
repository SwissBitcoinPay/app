import Btc from "@ledgerhq/hw-app-btc";
import { FormattedUtxo, WalletTransaction } from "@screens/Wallet/Wallet";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";
import { Psbt } from "bitcoinjs-lib";

export type HardwareWallet = PairedBitBox | Btc;

export type PrepareTransactionParams = {
  // ledger, bitbox-web
  hardwareWallet?: HardwareWallet;

  // bitbox-android
  account?: string;

  rootPath: string;
};

export type PrepareTransactionReturn = {
  masterFingerprint: string;
  bip84Account?: Bip84PrivateAccount;
};

export type PrepareFunction = (
  _params: PrepareTransactionParams
) => Promise<PrepareTransactionReturn>;

export type CreateTransactionParams = {
  psbt: Psbt;
  feeRate: number;
  usedUtxos: FormattedUtxo[];
  rootPath: string;
  masterFingerprint: string;

  // local
  bip84Account?: Bip84PrivateAccount;

  // ledger, bitbox-web
  hardwareWallet?: HardwareWallet;

  // bitbox-android
  account?: string;
};

export type CreateTransactionReturn = {
  txHex: string;
  psbt: Psbt;
};

export type CreateFunction = (
  _params: CreateTransactionParams
) => Promise<CreateTransactionReturn | undefined>;

export type Wallet = {
  prepareTransaction: PrepareFunction;
  createTransaction: CreateFunction;
};
