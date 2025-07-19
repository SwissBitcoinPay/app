import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getSupportedBiometryType } from "react-native-keychain";

export const useIsBiometrySupported = () => {
  const [isBiometrySupported, setIsBiometrySupported] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      (async () => {
        setIsBiometrySupported(!!(await getSupportedBiometryType()));
      })();
    }
  }, []);

  return isBiometrySupported;
};
