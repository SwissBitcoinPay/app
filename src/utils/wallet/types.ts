import { WalletTransaction } from "@screens/Wallet/Wallet";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";
import { Psbt } from "bitcoinjs-lib";

type PrepareTransactionParams = {
  // bitbox-web
  bitbox?: PairedBitBox;

  // bitbox-android
  account?: string;
};

type PrepareTransactionReturn = {
  masterFingerprint: string;
  bip84Account?: Bip84PrivateAccount;
};

export type PrepareFunction = (
  _params: PrepareTransactionParams
) => Promise<PrepareTransactionReturn>;

type CreateTransactionParams = {
  psbt: Psbt;
  feeRate: number;
  usedUtxos: WalletTransaction[];

  // local
  bip84Account?: Bip84PrivateAccount;

  // bitbox-web
  bitbox?: PairedBitBox;

  // bitbox-android
  account?: string;
};

export type CreateTransactionReturn = {
  txHex?: string;
};

export type CreateFunction = (
  _params: CreateTransactionParams
) => Promise<CreateTransactionReturn>;

export type Wallet = {
  prepareTransaction: PrepareFunction;
  createTransaction: CreateFunction;
};
