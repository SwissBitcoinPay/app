import { Psbt, initEccLib } from "bitcoinjs-lib";
import _ecc from "@bitcoinerlab/secp256k1";
// @ts-ignore
import BIP84 from "bip84";
import * as local from "./local";
import * as bitbox02 from "./bitbox02";
import * as ledger from "./ledger";
import { AddressDetail, FormattedUtxo } from "@screens/Wallet/Wallet";
import {
  AddressType,
  getAddressInfo,
  validate
} from "bitcoin-address-validation";
import axios from "axios";
import { HardwareReadyFunctionParams } from "@components/ConnectWalletModal/ConnectWalletModal";
import { Wallet, PrepareTransactionParams as WalletPrepareTransactionParams, CreateTransactionParams as WalletCreateTransactionParams } from "./types";
import { Bip84Account } from "@types";
import { DEFAULT_NETWORK } from "@config";
import { AsyncStorage } from "@utils/AsyncStorage";
import { keyStoreWalletPath } from "@config/settingsKeys";
import { AskWordsPassword } from "@config/SBPAskPasswordModalContext/SBPAskPasswordModalContext";

initEccLib(_ecc);

const types = {
  // MULTISIG-* do not include pubkeys or signatures yet (this is calculated at runtime)
  // sigs = 73 and pubkeys = 34 (these include pushdata byte)
  inputs: {
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:3(max))
    //   + (script_bytes(OP_0,PUSHDATA(max:3),m,n,CHECK_MULTISIG):5)
    "MULTISIG-P2SH": 51 * 4,
    // Segwit: (push_count:1) + (script_bytes(OP_0,PUSHDATA(max:3),m,n,CHECK_MULTISIG):5)
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:1)
    "MULTISIG-P2WSH": 8 + 41 * 4,
    // Segwit: (push_count:1) + (script_bytes(OP_0,PUSHDATA(max:3),m,n,CHECK_MULTISIG):5)
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:1) + (p2wsh:35)
    "MULTISIG-P2SH-P2WSH": 8 + 76 * 4,
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:1) + (sig:73) + (pubkey:34)
    P2PKH: 148 * 4,
    // Segwit: (push_count:1) + (sig:73) + (pubkey:34)
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:1)
    P2WPKH: 108 + 41 * 4,
    // Segwit: (push_count:1) + (sig:73) + (pubkey:34)
    // Non-segwit: (txid:32) + (vout:4) + (sequence:4) + (script_len:1) + (p2wpkh:23)
    "P2SH-P2WPKH": 108 + 64 * 4,
    P2TR: 66 + 41 * 4
  },
  outputs: {
    // (p2sh:24) + (amount:8)
    P2SH: 32 * 4,
    // (p2pkh:26) + (amount:8)
    P2PKH: 34 * 4,
    // (p2wpkh:23) + (amount:8)
    P2WPKH: 31 * 4,
    // (p2wsh:35) + (amount:8)
    P2WSH: 43 * 4,
    P2TR: 43 * 4
  }
};

type InputAddressTypes = keyof (typeof types)["inputs"];
type OutputAddressTypes = keyof (typeof types)["outputs"];

type InputsTypes = {
  [k in InputAddressTypes]: number;
};

type OutputsTypes = {
  [k in OutputAddressTypes]: number;
};

const getAddressType: (
  address: string
) => InputAddressTypes | OutputAddressTypes | undefined = (address: string) => {
  if (validate(address)) {
    const addressInfo = getAddressInfo(address);

    switch (addressInfo.type) {
      case AddressType.p2sh:
        return "P2SH";
      case AddressType.p2pkh:
        return "P2PKH";
      case AddressType.p2wpkh:
        return "P2WPKH";
      case AddressType.p2wsh:
        return "P2WSH";
      case AddressType.p2tr:
        return "P2TR";
    }
    return addressInfo.type as any;
  }
  return undefined;
};

export type LocalPrepareTransactionParams = {
  zPub: string;
  utxos: FormattedUtxo[];
  receiveAddress: string;
  amount: number;
  changeAddress?: AddressDetail;
  feeRate: number;
  walletType: string;
  askWordsPassword?: AskWordsPassword;
} & Partial<HardwareReadyFunctionParams>;

export const prepareTransaction = async ({
  zPub,
  utxos,
  receiveAddress,
  amount,
  changeAddress,
  feeRate,
  wallet: hardwareWallet,
  account,
  walletType,
  askWordsPassword
}: LocalPrepareTransactionParams) => {
  let wallet: Wallet | undefined;
  let pathPrefix = "";
  switch (walletType) {
    case "local":
      wallet = local as any;
      break;
    case "bitbox02":
      wallet = bitbox02 as any;
      break;
    case "ledger":
      wallet = ledger as any;
      // pathPrefix = "m/";
      break;
    default:
      throw new Error(`Unsupported wallet type: ${walletType}`);
  }

  if (!wallet) {
    throw new Error("Wallet not initialized");
  }

  let inputs: Partial<InputsTypes> = {};
  let outputs: Partial<OutputsTypes> = {};

  const psbt = new Psbt({ network: DEFAULT_NETWORK });

  const rootPath =
    (await AsyncStorage.getItem(keyStoreWalletPath)) || "m/84'/0'/0'";

  psbt.setVersion(1);
  psbt.setLocktime(0);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const bipPublicAccount: Bip84Account = new BIP84.fromZPub(zPub);

  const { bip84Account, masterFingerprint } = await wallet.prepareTransaction({
    hardwareWallet,
    account,
    rootPath,
    askWordsPassword
  } as any);

  const receiveAddressType = getAddressType(receiveAddress);
  if (receiveAddressType) {
    outputs = {
      ...outputs,
      [receiveAddressType]: ((outputs as any)[receiveAddressType] || 0) + 1
    };
  }

  if (changeAddress) {
    const changeAddressType = getAddressType(changeAddress.address);
    if (changeAddressType) {
      outputs = {
        ...outputs,
        [changeAddressType]: ((outputs as any)[changeAddressType] || 0) + 1
      };
    }
  }

  const usedUtxos: FormattedUtxo[] = [];
  let inputAmount = 0;
  let finalFee = 0;

  for (const utxo of utxos) {
    const addressType = getAddressType(utxo.address);
    if (addressType) {
      inputs = {
        ...inputs,
        [addressType]: ((inputs as any)[addressType] || 0) + 1
      };
    }

    const { data: rawTx } = await axios.get<string>(
      `https://mempool.space/api/tx/${utxo.txid}/hex`
    );

    const path = `${pathPrefix}${rootPath}/${utxo.change ? "1" : "0"}/${utxo.addressIndex}`;

    try {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vIndex,
        witnessUtxo: {
          script: Buffer.from(utxo.scriptPubKeyHex, "hex"),
          value: BigInt(utxo.value)
        },
        nonWitnessUtxo: Buffer.from(rawTx, "hex"),
        bip32Derivation: [
          {
            masterFingerprint: Buffer.from(masterFingerprint, "hex"),
            pubkey: Buffer.from(
              bipPublicAccount.getPublicKey(utxo.addressIndex, utxo.change),
              "hex"
            ),
            path: path
          }
        ]
      });
    } catch (e) {
      throw new Error(`Error preparing input ${(e as Error).toString()}`);
    }
    inputAmount += utxo.value;
    usedUtxos.push(utxo);

    const txBytes = getByteCount(inputs, outputs);
    finalFee = txBytes * feeRate;

    if (changeAddress && inputAmount >= amount + finalFee) {
      break;
    }
  }

  if (changeAddress && inputAmount < amount + finalFee) {
    throw new Error(
      `Wallet input balance (${inputAmount}) is not enough for transaction (${amount} + ${finalFee})`
    );
  }

  // add outputs as the buffer of receiver's address and the value with amount
  // of satoshis you're sending.
  psbt.addOutput({
    address: receiveAddress,
    value: BigInt(changeAddress ? amount : inputAmount - finalFee)
  });

  if (changeAddress) {
    // change Address
    psbt.addOutput({
      address: changeAddress.address,
      value: BigInt(inputAmount - amount - finalFee),
      bip32Derivation: [
        {
          masterFingerprint: Buffer.from(masterFingerprint, "hex"),
          pubkey: Buffer.from(
            bipPublicAccount.getPublicKey(changeAddress.index, true),
            "hex"
          ),
          path: `${pathPrefix}${rootPath}/1/${changeAddress.index}`
        }
      ]
    });
  }

  return await wallet.createTransaction({
    psbt,
    bip84Account,
    usedUtxos,
    hardwareWallet,
    feeRate,
    account,
    rootPath,
    masterFingerprint
  });
};

// Inspired by https://gist.github.com/junderw/b43af3253ea5865ed52cb51c200ac19c
const getByteCount = (inputs: Partial<InputsTypes>, outputs: Partial<OutputsTypes>) => {
  let totalWeight = 0;
  let hasWitness = false;
  let inputCount = 0;
  let outputCount = 0;
  // assumes compressed pubkeys in all cases.

  function checkUInt53(n: number) {
    if (n < 0 || n > Number.MAX_SAFE_INTEGER || n % 1 !== 0)
      throw new RangeError("value out of range");
  }

  function varIntLength(number: number) {
    checkUInt53(number);

    return number < 0xfd
      ? 1
      : number <= 0xffff
        ? 3
        : number <= 0xffffffff
          ? 5
          : 9;
  }

  Object.keys(inputs).forEach(function (key) {
    const inputCountValue = inputs[key as keyof InputsTypes];
    if (inputCountValue) {
      checkUInt53(inputCountValue);
      if (key.slice(0, 8) === "MULTISIG") {
        // ex. "MULTISIG-P2SH:2-3" would mean 2 of 3 P2SH MULTISIG
        const keyParts = key.split(":");
        if (keyParts.length !== 2) throw new Error("invalid input: " + key);
        const newKey = keyParts[0] as keyof typeof types.inputs;
        const mAndN = keyParts[1].split("-").map(function (item) {
          return parseInt(item);
        });

        totalWeight += types.inputs[newKey] * inputCountValue;
        const multiplyer = newKey === "MULTISIG-P2SH" ? 4 : 1;
        totalWeight += (73 * mAndN[0] + 34 * mAndN[1]) * multiplyer * inputCountValue;
      } else {
        totalWeight += types.inputs[key as keyof typeof types.inputs] * inputCountValue;
      }
      inputCount += inputCountValue;
      if (key.indexOf("W") >= 0) hasWitness = true;
    }
  });

  Object.keys(outputs).forEach(function (key) {
    const outputCountValue = outputs[key as keyof OutputsTypes];
    if (outputCountValue) {
      checkUInt53(outputCountValue);
      totalWeight += types.outputs[key as keyof typeof types.outputs] * outputCountValue;
      outputCount += outputCountValue;
    }
  });

  if (hasWitness) totalWeight += 2;

  totalWeight += 8 * 4;
  totalWeight += varIntLength(inputCount) * 4;
  totalWeight += varIntLength(outputCount) * 4;

  return Math.ceil(totalWeight / 4);
};
