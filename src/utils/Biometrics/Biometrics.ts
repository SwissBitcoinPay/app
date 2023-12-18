import { Biometrics as NativeBiometrics } from "./Biometrics.native";

export const Biometrics: typeof NativeBiometrics = {
  allowDeviceCredentials: false,
  isSensorAvailable: function (): Promise<never> {
    throw new Error("Function not implemented.");
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
