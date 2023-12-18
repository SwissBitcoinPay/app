import ReactNativeBiometrics from "react-native-biometrics";

const Biometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true
});

export { Biometrics };
