import { useContext } from "react";
import { SBPBitboxContext } from "@config";

const DEVICE_MODE = "bitbox02";

export const useBitboxBridge = () => {
  const { status } = useContext(SBPBitboxContext);

  return {
    deviceMode: DEVICE_MODE,
    status
  };
};
