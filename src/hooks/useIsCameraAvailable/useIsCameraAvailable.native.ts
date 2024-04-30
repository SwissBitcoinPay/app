import { isCameraPresentSync } from "react-native-device-info";

export const useIsCameraAvailable = () => {
  return isCameraPresentSync();
};
