import { TTxInput, proposeTx, sendTx } from "@utils/Bitbox/api/account";
import { CreateFunction, CreateTransactionParams, CreateTransactionReturn } from "@utils/wallet/types";

const txInputHashToString = (txInputHash: Uint8Array) => {
  return Array.from(txInputHash)
    .reverse()
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const createTransaction: CreateFunction = async ({
  account,
  psbt,
  feeRate
}: CreateTransactionParams): Promise<CreateTransactionReturn | undefined> => {
  if (!account) {
    throw new Error("Account is required for Android BitBox02");
  }

  const psbtOutput =
    psbt.txOutputs[psbt.data.outputs.findIndex((v) => !v.bip32Derivation)];

  const outputAddress = psbtOutput.address;
  if (!outputAddress) {
    throw new Error("Output address not found");
  }

  const outputValue = (Number(psbtOutput.value) / 100000000).toString();

  const selectedUTXOs = psbt.txInputs.map(
    (v) => `${txInputHashToString(v.hash)}:${v.index}`
  );

  const txInput: TTxInput = {
    address: outputAddress,
    amount: outputValue,
    feeTarget: "custom",
    customFee: feeRate.toString(),
    sendAll: psbt.txOutputs.length === 1 ? "yes" : "no",
    selectedUTXOs: selectedUTXOs
  };

  const proposeTxData = await proposeTx(account, txInput);

  if (proposeTxData.success) {
    const sendTxData = await sendTx(account);
    if (sendTxData.success) {
      return { txHex: sendTxData.txHex, psbt };
    }
  }

  return undefined;
};
