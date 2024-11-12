import { useEffect, useState } from "react";
import { isCameraPresent } from "react-native-device-info";

export const useIsCameraAvailable = () => {
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      setIsCameraAvailable(await isCameraPresent());
    })();
  }, []);

  return isCameraAvailable;
};
