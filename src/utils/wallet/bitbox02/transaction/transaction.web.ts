import { Psbt } from "bitcoinjs-lib";
import { CreateFunction } from "@utils/wallet/types";
import { PairedBitBox } from "bitbox-api";

export const createTransaction: CreateFunction = async ({
  hardwareWallet,
  psbt
}) => {
  const stringPsbt = psbt.toBase64();
  const signedPsbt = await (hardwareWallet as PairedBitBox).btcSignPSBT(
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
