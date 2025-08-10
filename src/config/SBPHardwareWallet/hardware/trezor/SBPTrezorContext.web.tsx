import React, { PropsWithChildren, useCallback, useState } from "react";
import { SBPTrezorContextType } from "./SBPTrezorContext";
import {
  AllHardwareTypes,
  HardwareState
} from "../../SBPHardwareWalletContext";
import { useToast } from "react-native-toast-notifications";
import { useSignature } from "./hooks";
import TrezorConnect from "@trezor/connect-web";

export const IS_TREZOR_SUPPORTED = true;

// @ts-ignore
export const SBPTrezorContext = React.createContext<SBPTrezorContextType>({});

export const SBPTrezorContextProvider = ({ children }: PropsWithChildren) => {
  // const [wallet, setWallet] = useState<Btc>();
  const [state, setState] = useState<HardwareState>();

  const toast = useToast();
  const init = useCallback(async () => {
    await TrezorConnect.init({
      lazyLoad: true,
      manifest: {
        email: "hello@swiss-bitcoin-pay.ch",
        appName: "Swiss Bitcoin Pay PoS",
        appUrl: "https://app.swiss-bitcoin-pay.ch",
        appIcon:
          "https://dashboard.swiss-bitcoin-pay.ch/e12a18c11792966d0494.png"
      }
    });

    setState(HardwareState.Signature);
  }, []);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const signatureFunctions = useSignature({
    error,
    getPublicKeyFn: TrezorConnect.getPublicKey,
    signMessageFn: TrezorConnect.signMessage
  });

  const onDisconnect = useCallback(() => {
    setState(HardwareState.Connect);
  }, []);

  const close = useCallback(() => {
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
        setWallet: () => {},
        ...signatureFunctions
      }}
    >
      {children}
    </SBPTrezorContext.Provider>
  );
};
