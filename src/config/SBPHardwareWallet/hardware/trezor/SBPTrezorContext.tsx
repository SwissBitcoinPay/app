import React, { PropsWithChildren, useCallback, useState } from "react";
import {
  HardwareState,
  SBPHardwareWalletContextType
} from "../../SBPHardwareWalletContext";
import { useToast } from "react-native-toast-notifications";
import { useSignature } from "./hooks";

export const IS_TREZOR_SUPPORTED: boolean = false;

export type SBPTrezorContextType = SBPHardwareWalletContextType;

// @ts-ignore
export const SBPTrezorContext = React.createContext<SBPTrezorContextType>({});

export const SBPTrezorContextProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<HardwareState>();

  const toast = useToast();
  const init = useCallback(() => {}, []);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const signatureFunctions = useSignature({ error });

  const onDisconnect = useCallback(() => {
    setState(HardwareState.Connect);
  }, []);

  const close = useCallback(async () => {
    TrezorConnect.dispose();
    setState(undefined);
  }, []);

  return (
    <SBPTrezorContext.Provider
      value={{
        state,
        init,
        close,
        onDisconnect,
        ...signatureFunctions
      }}
    >
      {children}
    </SBPTrezorContext.Provider>
  );
};
