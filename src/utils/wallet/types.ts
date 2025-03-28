import Btc from "@ledgerhq/hw-app-btc";
import { WalletTransaction } from "@screens/Wallet/Wallet";
import { Bip84PrivateAccount } from "@types";
import { PairedBitBox } from "bitbox-api";
import { Psbt } from "bitcoinjs-lib";

export type HardwareWallet = PairedBitBox | Btc;

type PrepareTransactionParams = {
  // ledger, bitbox-web
  hardwareWallet?: HardwareWallet;

  // bitbox-android
  account?: string;

  rootPath: string;
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
  txHex?: string;
};

export type CreateFunction = (
  _params: CreateTransactionParams
) => Promise<CreateTransactionReturn>;

export type Wallet = {
  prepareTransaction: PrepareFunction;
  createTransaction: CreateFunction;
};
