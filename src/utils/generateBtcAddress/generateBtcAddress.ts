import * as BIP39 from "bip39";
// @ts-ignore
import BIP84 from "bip84";
import { getRandom } from "./getRandom";

export const generateBtcAddress = async (existingMnemonic?: string) => {
  const mnemonic =
    existingMnemonic || BIP39.entropyToMnemonic(await getRandom(16));

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const root = new BIP84.fromMnemonic(mnemonic);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const child0 = root.deriveAccount(0);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const firstAccount = new BIP84.fromZPrv(child0);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const zPub: string = firstAccount.getAccountPublicKey();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const firstAddress: string = firstAccount.getAddress(0);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const firstAddressPrivateKey: string = firstAccount.getPrivateKey(0);

  const ret = {
    words: mnemonic.split(" "),
    zPub,
    firstAddress,
    firstAddressPrivateKey
  };

  return ret;
};
