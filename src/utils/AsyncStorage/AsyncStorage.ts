import { ACCESS_CONTROL, AuthenticationPrompt } from "react-native-keychain";
import secureLocalStorage from "react-secure-storage";

// eslint-disable-next-line @typescript-eslint/require-await
const getItem = async (key: string, _prompt?: AuthenticationPrompt) => {
  return localStorage.getItem(key)?.toString();
};

const setItem = async (
  key: string,
  value: string,
  _accessControl?: ACCESS_CONTROL
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  return localStorage.setItem(key, value);
};

// eslint-disable-next-line @typescript-eslint/require-await
const removeItem = async (key: string) => {
  return localStorage.removeItem(key);
};

// eslint-disable-next-line @typescript-eslint/require-await
const clear = async () => {
  return localStorage.clear();
};

const AsyncStorage = { getItem, setItem, removeItem, clear };

export { AsyncStorage };
