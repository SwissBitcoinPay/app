import jseu from "js-encoding-utils";
import hmac from "js-crypto-hmac";
import { AsyncStorage } from "./AsyncStorage";

const keyStoreHmac = "settings.hmac";

export const getSha256 = async (data: string) => {
  const storedHmac = await AsyncStorage.getItem(keyStoreHmac);

  if (storedHmac) {
    const key = jseu.encoder.stringToArrayBuffer(storedHmac);
    const msg = jseu.encoder.stringToArrayBuffer(data);
    const hash = "SHA-256";
    const result = await hmac.compute(key, msg, hash);

    const sha256 = jseu.encoder.arrayBufferToHexString(result);

    return sha256;
  }

  return "";
};
