import React, { PropsWithChildren, useCallback } from "react";
import { BitBox, PairedBitBox, PairingBitBox } from "bitbox-api";
import { TStatus } from "@utils/Bitbox/api/bitbox02";
import {
  BackupMode,
  SBPHardwareWalletContextType
} from "@config/SBPHardwareWallet";

export const IS_BITBOX_SUPPORTED: boolean = false;

export type BitboxWallets = BitBox | PairingBitBox | PairedBitBox;

export type SBPBitboxContextType<T = BitboxWallets> =
  SBPHardwareWalletContextType<T> & {
    setIsBitboxServerRunning: (value: boolean) => Promise<void>;
    setAttentionToHardware: (value: boolean) => void;
    setPairingHash: (value: string) => void;
    setBackupMode: (value: BackupMode) => void;
    backupMode: BackupMode;
    pairingHash?: string;
    status: TStatus;
  };

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  const setIsBitboxServerRunning = useCallback(() => {}, []);
  const setAttentionToHardware = useCallback(() => {}, []);
  return (
    <SBPBitboxContext.Provider
      value={{ setIsBitboxServerRunning, setAttentionToHardware }}
    >
      {children}
    </SBPBitboxContext.Provider>
  );
};
