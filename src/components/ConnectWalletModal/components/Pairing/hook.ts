import { SBPBitboxContext } from "@config";
import { getChannelHash, verifyChannelHash } from "@utils/Bitbox/api/bitbox02";
import { useCallback, useContext, useEffect, useState } from "react";

export const usePairing = (deviceId: string) => {
  const { subscribeLegacy, setAttentionToBitbox } =
    useContext(SBPBitboxContext);

  const [hash, setHash] = useState("");

  const onChannelHashChanged = useCallback(() => {
    (async () => {
      const channelHash = await getChannelHash(deviceId);

      setHash(channelHash.hash);
      setAttentionToBitbox(true);
      if (channelHash.deviceVerified) {
        await verifyChannelHash(deviceId, true);
      }
    })();
  }, [deviceId, setAttentionToBitbox]);

  useEffect(() => {
    return () => {
      setAttentionToBitbox(false);
    };
  }, []);

  useEffect(onChannelHashChanged, [deviceId, onChannelHashChanged]);

  const channelHashChanged = (
    deviceID: string,
    cb: (deviceID: string) => void
  ): TUnsubscribe => {
    const unsubscribe = subscribeLegacy("channelHashChanged", (event) => {
      if (event.type === "device" && event.deviceID === deviceID) {
        cb(deviceID);
      }
    });
    return unsubscribe;
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return channelHashChanged(deviceId, onChannelHashChanged);
  }, [onChannelHashChanged, deviceId]);

  return { hash };
};
