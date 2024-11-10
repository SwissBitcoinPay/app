import React, { PropsWithChildren, useCallback, useState } from "react";
import { SBPBitboxContextType } from "./SBPBitboxContext";
import { BitBox, PairedBitBox, PairingBitBox } from "bitbox-api";
import { TStatus } from "@utils/Bitbox/api/bitbox02";
import { sleep } from "@utils";

export const IS_BITBOX_SUPPORTED = true;

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  const [unpaired, setUnpaired] = useState<BitBox>();
  const [pairedBitbox, setPairedBitbox] = useState<PairedBitBox>();
  const [pairingBitbox, setPairingBitbox] = useState<PairingBitBox>();
  const [pairingCode, setPairingCode] = useState<string>();
  const [status, setStatus] = useState<TStatus>();

  const setAttentionToBitbox = useCallback(() => {}, []);

  const _setUnpaired = useCallback((value: BitBox) => {
    setUnpaired(value);
    setStatus("connected");
  }, []);

  const _setPairingBitbox = useCallback((value: PairingBitBox) => {
    setPairingBitbox(value);
    setStatus("unpaired");
  }, []);

  const _setPairedBitbox = useCallback(async (value: PairedBitBox) => {
    const deviceInfo = await value.deviceInfo();

    if (deviceInfo.initialized) {
      setPairedBitbox(value);
      setStatus("initialized");
    } else {
      setStatus("uninitialized");
      value.close();
    }
  }, []);

  const setIsBitboxServerRunning = useCallback(
    async (isRunning: boolean) => {
      if (!isRunning) {
        try {
          pairedBitbox?.close();
        } catch (e) {}
        await sleep(1000);
        setPairedBitbox(undefined);
        setPairingBitbox(undefined);
        setUnpaired(undefined);
      }
    },
    [pairedBitbox]
  );

  return (
    <SBPBitboxContext.Provider
      value={{
        setIsBitboxServerRunning,
        unpaired,
        pairedBitbox,
        status,
        setUnpaired: _setUnpaired,
        setPairedBitbox: _setPairedBitbox,
        setAttentionToBitbox,
        setPairingCode,
        pairingCode,
        setPairingBitbox: _setPairingBitbox,
        pairingBitbox
      }}
    >
      {children}
    </SBPBitboxContext.Provider>
  );
};
