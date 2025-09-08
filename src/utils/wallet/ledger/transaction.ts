import { CreateFunction } from "@utils/wallet/types";
import AppClient, { DefaultWalletPolicy } from "ledger-bitcoin";
import * as bitcoin from "bitcoinjs-lib";

const NETWORK = bitcoin.networks.bitcoin;

export const createTransaction: CreateFunction = async ({
  hardwareWallet,
  psbt,
  rootPath,
  masterFingerprint
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const app = new AppClient(hardwareWallet._transport);

  console.log({ rootPath });
  const xpub = await app.getExtendedPubkey(`${rootPath}`, false);

  console.log({ xpub }, `[${masterFingerprint}/${rootPath}]${xpub}`);

  const signingPolicy = new DefaultWalletPolicy(
    "wpkh(@0/**)",
    `[${masterFingerprint}/${rootPath.replace("m/", "")}]${xpub}`
  );

  console.log("STEP 1");

  const ledgerSignature = await app.signPsbt(psbt.toBase64(), signingPolicy);
  console.log("STEP 2");

  const newTxIsSegwit = true;

  for (let index = 0; index < ledgerSignature.length; index++) {
    const { pubkey, signature } = ledgerSignature[index][1];

    const signer = {
      network: NETWORK,
      publicKey: pubkey,
      sign: () => {
        const encodedSignature = (() => {
          if (newTxIsSegwit) {
            return Buffer.from(signature, "hex");
          }
          return Buffer.concat([
            Buffer.from(signature, "hex"),
            Buffer.from("01", "hex") // SIGHASH_ALL
          ]);
        })();
        const decoded = bitcoin.script.signature.decode(encodedSignature);
        return decoded.signature;
      }
    };

    psbt.signInput(index, signer);
  }

  psbt.finalizeAllInputs();

  return {
    txHex: psbt.extractTransaction().toHex()
  };
};
