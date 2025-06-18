import React, { PropsWithChildren, useContext, useState } from "react";
import { AddressSignResponse, ScriptType } from "@utils/Bitbox/api/account";
import { BitboxWallets, SBPBitboxContext } from "./hardware/bitbox02";
import Btc from "@ledgerhq/hw-app-btc";
import { SBPLedgerContext } from "./hardware";

export enum HardwareState {
  Connect,
  Transport,
  SelectDevice,
  Bootloader,
  Connected,
  Pairing,
  Setup,
  AfterSetup,
  Signature
}

export type BackupMode = "sdcard" | "12-words" | "24-words";

export type HardwareType = "bitbox02" | "ledger";

export type AllHardwareTypes = BitboxWallets | Btc;

export type SBPHardwareWalletContextType<T = AllHardwareTypes> = {
  state?: HardwareState;

  setWallet: (value: T) => void;
  wallet: T;

  onDisconnect: () => void;

  setAttentionToHardware?: (value: boolean) => void;

  // other states
  setIsHardwareUpgraded?: (value: boolean) => void;
  isHardwareUpgraded?: boolean;

  screenComponentProps?: { [k in string]: never };

  // wallet interaction
  init?: () => Awaited<void>;
  close?: () => Awaited<void>;
} & {
  getAccounts: () => Promise<
    {
      label: string;
      account: string;
      path: string | undefined;
      zpub: string | undefined;
    }[]
  >;
  getAccountFirstAddress: (
    scriptType: ScriptType,
    account: string
  ) => Promise<string | undefined>;
  signMessage: (
    format: ScriptType,
    message: string,
    account: string
  ) => Promise<AddressSignResponse>;
};

type SBPHardwareWalletContextTypeWithSet = {
  hardwareType: HardwareType;
  setHardwareType: (value: HardwareType) => void;
} & SBPHardwareWalletContextType;

// @ts-ignore
export const SBPHardwareWalletContext =
  React.createContext<SBPHardwareWalletContextTypeWithSet>({});

export const SBPHardwareWalletContextProvider = ({
  children
}: PropsWithChildren) => {
  const [hardwareType, setHardwareType] = useState<HardwareType>();

  const hardwareContext =
    hardwareType === "bitbox02"
      ? SBPBitboxContext
      : hardwareType === "ledger"
        ? SBPLedgerContext
        : SBPHardwareWalletContext;

  const context = useContext(hardwareContext);

  return (
    <SBPHardwareWalletContext.Provider
      value={{
        ...context,
        hardwareType,
        setHardwareType
      }}
    >
      {children}
    </SBPHardwareWalletContext.Provider>
  );
};
