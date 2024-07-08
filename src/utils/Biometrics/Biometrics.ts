import { BiometryType } from "react-native-biometrics";
import { Biometrics as NativeBiometrics } from "./Biometrics.native";

export const Biometrics: typeof NativeBiometrics = {
  allowDeviceCredentials: false,
  isSensorAvailable: async () => {
    return new Promise<{
      available: boolean;
      biometryType?: BiometryType;
      error?: string;
    }>((r) =>
      r({
        available: false
      })
    );
  },
  createKeys: function (): Promise<never> {
    throw new Error("Function not implemented.");
  },
  biometricKeysExist: function (): Promise<never> {
    throw new Error("Function not implemented.");
  },
  deleteKeys: function (): Promise<never> {
    throw new Error("Function not implemented.");
  },
  createSignature: function (_createSignatureOptions): Promise<never> {
    throw new Error("Function not implemented.");
  },
  simplePrompt: function (_simplePromptOptions): Promise<never> {
    throw new Error("Function not implemented.");
  }
};
