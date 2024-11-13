import { Psbt } from "bitcoinjs-lib";
import { CreateFunction } from "@utils/wallet/types";

export const createTransaction: CreateFunction = async ({ bitbox, psbt }) => {
  const stringPsbt = psbt.toBase64();
  const signedPsbt = await bitbox.btcSignPSBT(
    "btc",
    stringPsbt,
    undefined,
    "default"
  );

  return {
    txHex: Psbt.fromBase64(signedPsbt)
      .finalizeAllInputs()
      .extractTransaction()
      .toHex()
  };
};
