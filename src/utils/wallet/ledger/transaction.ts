import { CreateFunction, CreateTransactionParams, CreateTransactionReturn } from "@utils/wallet/types";
import AppClient, { DefaultWalletPolicy } from "ledger-bitcoin";
import * as bitcoin from "bitcoinjs-lib";

const NETWORK = bitcoin.networks.bitcoin;

export const createTransaction: CreateFunction = async ({
  hardwareWallet,
  psbt,
  rootPath,
  masterFingerprint
}: CreateTransactionParams): Promise<CreateTransactionReturn | undefined> => {
  if (!hardwareWallet) {
    throw new Error("Hardware wallet is required for Ledger");
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const app = new AppClient((hardwareWallet as any)._transport);

  const xpub = await app.getExtendedPubkey(`${rootPath}`, false);

  const signingPolicy = new DefaultWalletPolicy(
    "wpkh(@0/**)",
    `[${masterFingerprint}/${rootPath.replace("m/", "")}]${xpub}`
  );

  const ledgerSignature = await app.signPsbt(psbt.toBase64(), signingPolicy, null);

  const newTxIsSegwit = true;

  for (let index = 0; index < ledgerSignature.length; index++) {
    const [inputIndex, { pubkey, signature }] = ledgerSignature[index];

    const signer = {
      network: NETWORK,
      publicKey: pubkey,
      sign: () => {
        const encodedSignature = (() => {
          if (newTxIsSegwit) {
            return Buffer.from(signature as unknown as string, "hex");
          }
          return Buffer.concat([
            Buffer.from(signature as unknown as string, "hex"),
            Buffer.from("01", "hex") // SIGHASH_ALL
          ]);
        })();
        const decoded = bitcoin.script.signature.decode(encodedSignature);
        return decoded.signature;
      }
    };

    psbt.signInput(inputIndex, signer);
  }

  psbt.finalizeAllInputs();

  return {
    txHex: psbt.extractTransaction().toHex(),
    psbt: psbt
  };
};
