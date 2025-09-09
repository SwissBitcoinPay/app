import RNAsyncStorage from "@react-native-async-storage/async-storage";
import EncryptedStorage from "react-native-encrypted-storage";
import * as Keychain from "react-native-keychain";
import * as keys from "@config/settingsKeys";

const SECURE_RULES = Keychain.SECURITY_RULES.AUTOMATIC_UPGRADE;

const getItem = async (key: string, prompt?: Keychain.AuthenticationPrompt) => {
  try {
    const encryptedValue = await Keychain.getGenericPassword({
      service: key,
      // rules: SECURE_RULES // Commented out as rules is not a valid property,
      authenticationPrompt: prompt
    });
    if (encryptedValue) return encryptedValue.password;
  } catch (e) {}

  try {
    const secureValue = await EncryptedStorage.getItem(key);
    if (secureValue) return secureValue;
  } catch (e) {}

  try {
    const rawValue = await RNAsyncStorage.getItem(key);
    if (rawValue) return rawValue;
  } catch (e) {}

  return null;
};

const setItem = async (
  key: string,
  value: string,
  accessControl?: Keychain.ACCESS_CONTROL
) => {
  return await Keychain.setGenericPassword(key, value, {
    service: key,
    accessControl,
    // rules: SECURE_RULES // Commented out as rules is not a valid property
  });
};

const removeItem = async (key: string) => {
  await Keychain.resetGenericPassword({ service: key });
  await EncryptedStorage.removeItem(key);
  return await RNAsyncStorage.removeItem(key);
};

const clear = async () => {
  Object.values(keys).forEach(async (key) => {
    await Keychain.resetGenericPassword({ service: key });
  });

  await EncryptedStorage.clear();
  return await RNAsyncStorage.clear();
};

const AsyncStorage = { getItem, setItem, removeItem, clear };

export { AsyncStorage };
