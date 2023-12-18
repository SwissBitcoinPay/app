import { Network, getAddressInfo } from "bitcoin-address-validation";

export const validateBitcoinAddress = (input: string) => {
  try {
    return getAddressInfo(input).network === Network.mainnet;
  } catch (e) {}

  return false;
};
