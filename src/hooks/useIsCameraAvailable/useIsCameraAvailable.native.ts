import { useCameraDevices } from "react-native-vision-camera";

export const useIsCameraAvailable = () => {
  const devices = useCameraDevices();

  return devices.length > 0;
};
