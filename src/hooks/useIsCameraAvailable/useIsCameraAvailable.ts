import { useEffect, useState } from "react";

export const useIsCameraAvailable = () => {
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput"
      ) as InputDeviceInfo[];

      setIsCameraAvailable(devices.length > 0);
    })();
  }, []);

  return isCameraAvailable;
};
