import React, { PropsWithChildren, useCallback, useState } from "react";
import { SBPLedgerContextType } from "./SBPLedgerContext";
import Btc from "@ledgerhq/hw-app-btc";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import { HardwareState } from "../../SBPHardwareWalletContext";
import { useToast } from "react-native-toast-notifications";
import { useSignature } from "./hooks";
import Transport from "@ledgerhq/hw-transport";

export const IS_LEDGER_SUPPORTED = true;

// @ts-ignore
export const SBPLedgerContext = React.createContext<SBPLedgerContextType>({});

export const SBPLedgerContextProvider = ({ children }: PropsWithChildren) => {
  const [wallet, setWallet] = useState<Btc>();
  const [transport, setTransport] = useState<Transport>();
  const [state, setState] = useState<HardwareState>();

  const toast = useToast();
  const init = useCallback(() => {
    setState(HardwareState.Transport);
  }, []);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const signatureFunctions = useSignature({ wallet, transport, error });

  const _setTransport = useCallback(async () => {
    setState(HardwareState.Connect);

    try {
      const isWebUSBsupported = await TransportWebUSB.isSupported();
      const _transport = isWebUSBsupported
        ? await TransportWebUSB.create()
        : await TransportWebHID.create();

      setTransport(_transport);
      const ledger = new Btc({
        transport: _transport,
        scrambleKey: "BTC",
        currency: "bitcoin"
      });
      setWallet(ledger);
      setState(HardwareState.Signature);
    } catch (e) {
      error(e.message);
    }
  }, [error]);

  const onDisconnect = useCallback(() => {
    setState(HardwareState.Connect);
  }, []);

  const close = useCallback(() => {
    setWallet(undefined);
    setState(undefined);
  }, []);

  return (
    <SBPLedgerContext.Provider
      value={{
        state,
        init,
        close,
        setTransport: _setTransport,
        onDisconnect,
        setWallet,
        wallet,
        ...signatureFunctions
      }}
    >
      {children}
    </SBPLedgerContext.Provider>
  );
};
