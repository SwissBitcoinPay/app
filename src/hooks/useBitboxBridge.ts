import { useCallback, useContext, useEffect, useMemo } from "react";
import { useSync } from "./bitbox/api";
import {
  TDevices,
  TProductName,
  getDeviceList
} from "@utils/Bitbox/api/devices";
import { useDefault } from "./bitbox/default";
import { SBPBitboxContext, platform } from "@config";
import { getStatus } from "@utils/Bitbox/api/bitbox02";
import {
  getStatus as bootloaderGetStatus,
  screenRotate
} from "@utils/Bitbox/api/bitbox02bootloader";

const { isBitcoinize } = platform;

export const useBitboxBridge = () => {
  const { subscribeEndpoint, subscribeLegacy } = useContext(SBPBitboxContext);

  const syncDeviceList = useCallback<
    (cb: (accounts: TDevices) => void) => TDevices
  >((cb) => subscribeEndpoint("devices/registered", cb), [subscribeEndpoint]);

  const devices = useDefault(useSync(getDeviceList, syncDeviceList), {});

  const [[deviceId, deviceMode] = []]: [string, TProductName][] = useMemo(
    () =>
      Object.keys(devices).map((key) => [key, devices[key]]) || [
        ["androidDevice", "bitbox02-bootloader"]
      ],
    [devices]
  );

  const syncStatus = useCallback(
    (cb: (accounts: TDevices) => void) => {
      const unsubscribe = subscribeLegacy("statusChanged", (event) => {
        if (event.type === "device" && event.deviceID === deviceId) {
          getStatus(deviceId).then(cb);
        }
      });
      return unsubscribe;
    },
    [deviceId, subscribeLegacy]
  );

  const status = useSync(
    useCallback(() => getStatus(deviceId), [deviceId]),
    syncStatus,
    deviceMode !== "bitbox02"
  );

  const bootloaderSyncStatus = useCallback(
    (cb: (accounts: TDevices) => void) =>
      subscribeEndpoint(`devices/bitbox02-bootloader/${deviceId}/status`, cb),
    [deviceId, subscribeEndpoint]
  );

  const bootloaderStatus = useSync(
    useCallback(() => bootloaderGetStatus(deviceId), [deviceId]),
    bootloaderSyncStatus,
    deviceMode !== "bitbox02-bootloader"
  );

  useEffect(() => {
    if (deviceMode === "bitbox02-bootloader" && isBitcoinize) {
      (async () => {
        await screenRotate(deviceId);
      })();
    }
  }, [deviceMode]);

  return {
    deviceId,
    deviceMode,
    status:
      deviceMode === "bitbox02"
        ? status
        : deviceMode === "bitbox02-bootloader"
        ? bootloaderStatus
        : undefined
  };
};
