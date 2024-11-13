import { useContext, useEffect } from "react";
import { SBPBitboxContext } from "@config";

const DEVICE_MODE = "bitbox02";

export const useBitboxBridge = () => {
  const { status, pairedBitbox } = useContext(SBPBitboxContext);

  useEffect(() => {
    return () => {
      pairedBitbox?.close();
    };
  }, []);

  return {
    deviceMode: DEVICE_MODE,
    status
  };
};
