import { describe, expect, it, jest } from "@jest/globals";
import { Psbt, Transaction, address, networks } from "bitcoinjs-lib";
import { prepareTransaction } from "./prepare-transaction";
import type { FormattedUtxo } from "@screens/Wallet/Wallet";

// Vecteurs BIP84 (mnemonic « abandon … about »), compte 0 mainnet.
const ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const RECEIVE_0 = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
const RECEIVE_1 = "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g";

// Paquet ESM-only (non chargeable sous jest) : toutes les adresses du test
// sont des P2WPKH mainnet.
jest.mock("bitcoin-address-validation", () => ({
  AddressType: { p2wpkh: "p2wpkh" },
  validate: () => true,
  getAddressInfo: () => ({ type: "p2wpkh" })
}));
jest.mock("@config", () => ({
  getBitcoinNetwork: () => ({
    lib: jest.requireActual<typeof import("bitcoinjs-lib")>("bitcoinjs-lib")
      .networks.bitcoin,
    isTestnet: false
  })
}));
jest.mock("@utils/AsyncStorage", () => ({
  AsyncStorage: { getItem: () => Promise.resolve(null) }
}));
jest.mock("./bitbox02", () => ({}));
jest.mock("./ledger", () => ({}));
jest.mock("./local", () => ({
  prepareTransaction: () => Promise.resolve({ masterFingerprint: "73c5da0a" }),
  // Renvoie le PSBT construit, pour inspecter les inputs.
  createTransaction: ({ psbt }: { psbt: Psbt }) => Promise.resolve(psbt)
}));

// Tx parente qui paie 100 000 sats sur la première adresse de réception.
const buildParentTx = () => {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 1), 0);
  tx.addOutput(address.toOutputScript(RECEIVE_0, networks.bitcoin), 100000n);
  return tx;
};

describe("prepareTransaction", () => {
  it("uses the parent tx hex returned by the backend as nonWitnessUtxo", async () => {
    const parent = buildParentTx();
    const utxo: FormattedUtxo = {
      txid: parent.getId(),
      rawTx: parent.toHex(),
      address: RECEIVE_0,
      scriptPubKeyHex: Buffer.from(parent.outs[0].script).toString("hex"),
      value: 100000,
      vIndex: 0,
      addressIndex: 0,
      change: false
    };

    const psbt = (await prepareTransaction({
      zPub: ZPUB,
      utxos: [utxo],
      receiveAddress: RECEIVE_1,
      amount: 50000,
      feeRate: 1,
      walletType: "local"
    })) as unknown as Psbt;

    expect(psbt.data.inputs).toHaveLength(1);
    expect(
      Buffer.from(psbt.data.inputs[0].nonWitnessUtxo as Uint8Array).toString(
        "hex"
      )
    ).toBe(utxo.rawTx);
  });
});
