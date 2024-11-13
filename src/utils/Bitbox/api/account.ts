/**
 * Copyright 2021-2024 Shift Crypto AG
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { apiGet, apiPost } from "./request";

export type AccountCode = string;

export type TKeystore = {
  watchonly: boolean;
  rootFingerprint: string;
  name: string;
  lastConnected: string;
  connected: boolean;
};

export interface IAccount {
  keystore: TKeystore;
  active: boolean;
  watch: boolean;
  coinCode: CoinCode;
  coinUnit: string;
  coinName: string;
  code: AccountCode;
  name: string;
  isToken: boolean;
  blockExplorerTxPrefix: string;
}

export const getAccounts = (): Promise<IAccount[]> => {
  return apiGet("accounts");
};

export interface IReceiveAddress {
  addressID: string;
  address: string;
}

export interface ReceiveAddressList {
  scriptType: ScriptType | null;
  addresses: IReceiveAddress[];
}

export const getReceiveAddressList = (
  code: AccountCode
): Promise<ReceiveAddressList[] | null> => {
  return apiGet(`account/${code}/receive-addresses`);
};

export type ScriptType = "p2pkh" | "p2wpkh-p2sh" | "p2wpkh" | "p2tr";

export const allScriptTypes: ScriptType[] = [
  "p2pkh",
  "p2wpkh-p2sh",
  "p2wpkh",
  "p2tr"
];

export interface IKeyInfo {
  keypath: string;
  rootFingerprint: string;
  xpub: string;
}

export type TBitcoinSimple = {
  keyInfo: IKeyInfo;
  scriptType: ScriptType;
};

export type TSigningConfiguration = {
  bitcoinSimple: TBitcoinSimple;
};

export type TSigningConfigurationList = null | {
  signingConfigurations: TSigningConfiguration[];
};

export const getInfo = (
  code: AccountCode
): Promise<TSigningConfigurationList> => {
  return apiGet(`account/${code}/info`);
};

export type AddressSignResponse =
  | {
      success: true;
      signature: string;
      address: string;
    }
  | {
      success: false;
      errorMessage?: string;
      errorCode?: "userAbort" | "wrongKeystore";
    };

export const signAddress = (
  format: ScriptType | "",
  msg: string,
  code: AccountCode
): Promise<AddressSignResponse> => {
  return apiPost(`account/${code}/sign-address`, { format, msg, code });
};

export type FeeTargetCode = "custom" | "low" | "economy" | "normal" | "high";

export type TTxInput = {
  address: string;
  amount: string;
  feeTarget: FeeTargetCode;
  customFee: string;
  sendAll: "yes" | "no";
  selectedUTXOs: string[];
};

export interface IAmount {
  amount: string;
  conversions?: Conversions;
  unit: CoinUnit;
  estimated: boolean;
}

export type TTxProposalResult =
  | {
      amount: IAmount;
      fee: IAmount;
      success: true;
      total: IAmount;
    }
  | {
      errorCode: string;
      success: false;
    };

export const proposeTx = (
  accountCode: AccountCode,
  txInput: TTxInput
): Promise<TTxProposalResult> => {
  return apiPost(`account/${accountCode}/tx-proposal`, txInput);
};

export type ISendTx =
  | {
      success: true;
      txHex: string;
    }
  | {
      success: false;
      aborted?: boolean;
      errorMessage?: string;
      errorCode?: string;
    };

export const sendTx = (code: AccountCode): Promise<ISendTx> => {
  return apiPost(`account/${code}/sendtx`);
};