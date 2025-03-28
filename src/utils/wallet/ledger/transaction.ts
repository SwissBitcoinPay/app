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

  const firstAccountPubkey = await app.getExtendedPubkey(
    `m/${rootPath}`,
    false
  );

  const signingPolicy = new DefaultWalletPolicy(
    "wpkh(@0/**)",
    `[${masterFingerprint}/${rootPath}]${firstAccountPubkey}`
  );

  const ledgerSignature = await app.signPsbt(psbt.toBase64(), signingPolicy);

  const { pubkey, signature } = ledgerSignature[0][1];

  const newTxIsSegwit = true;

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

  for (let index = 0; index < psbt.txInputs.length; index++) {
    await psbt.signInputAsync(index, signer);
  }

  psbt.finalizeAllInputs();

  return {
    txHex: psbt.extractTransaction().toHex()
  };
};
