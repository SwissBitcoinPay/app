import React, { PropsWithChildren } from "react";
import { TDevices } from "@utils/Bitbox/api/devices";
import {
  TMsgCallback,
  TPayload,
  TUnsubscribe
} from "@utils/Bitbox/api/transport-common";
import { TSubscriptionCallback } from "@utils/Bitbox/api/subscribe";
import { BackupMode } from "@components/ConnectWalletModal/components/Setup/Setup";
import { XOR } from "ts-essentials";
import { BitBox, PairedBitBox, PairingBitBox } from "bitbox-api";
import { TStatus } from "@utils/Bitbox/api/bitbox02";

export type SBPBitboxContextType = {
  setIsBitboxServerRunning: (value: boolean) => void;
  setAttentionToBitbox: (value: boolean) => void;
} & XOR<
  {
    devices: TDevices;
    pushNotificationListener: (msgCallback: TMsgCallback) => void;
    onNotification: (msg: TPayload) => void;
    apiSubscribe: <T>(
      endpoint: string,
      cb: TSubscriptionCallback<T>
    ) => TUnsubscribe;
    subscribeLegacy: <T>(
      endpoint: string,
      cb: TSubscriptionCallback<T>
    ) => TUnsubscribe;
    subscribeEndpoint: <T>(
      endpoint: string,
      cb: TSubscriptionCallback<T>
    ) => () => void;
    setIsAfterUpgradeScreen: (value: boolean) => void;
    isAfterUpgradeScreen: boolean;
    setAfterSetupMode: (value: BackupMode) => void;
    afterSetupMode: BackupMode;
  },
  {
    unpaired?: BitBox;
    pairedBitbox?: PairedBitBox;
    status?: TStatus;
    setUnpaired: (value: BitBox) => void;
    setPairedBitbox: (value: PairedBitBox) => void;
    setPairingBitbox: (value: PairingBitBox) => void;
    pairingBitbox?: PairingBitBox;
    setPairingCode: (value: string) => void;
    pairingCode?: string;
  }
>;

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  return (
    <SBPBitboxContext.Provider value={{}}>{children}</SBPBitboxContext.Provider>
  );
};
