import { Network, getAddressInfo } from "bitcoin-address-validation";
import { getBitcoinNetwork } from "@config";

export const validateBitcoinAddress = (input: string) => {
  try {
    console.log("Validating Bitcoin address:", input);
    const { name } = getBitcoinNetwork();
    console.log("Expected network name:", name);
    const castTestnetTo = name === "signet" ? Network.signet : undefined;
    console.log({
      name,
      castTestnetTo,
      getAddressInfo: getAddressInfo(input, { castTestnetTo })
    });
    return getAddressInfo(input, { castTestnetTo }).network === name;
  } catch (e) {
    console.error("Error validating Bitcoin address:", e);
  }

  return false;
};
