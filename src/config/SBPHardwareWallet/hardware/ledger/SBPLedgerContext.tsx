import React, { PropsWithChildren, useCallback, useState } from "react";
import Btc from "@ledgerhq/hw-app-btc";
import {
  HardwareState,
  SBPHardwareWalletContextType
} from "../../SBPHardwareWalletContext";
import { useToast } from "react-native-toast-notifications";
import TransportRNHID from "@ledgerhq/react-native-hid";
import TransportRNBLE from "@ledgerhq/react-native-hw-transport-ble";
import { useSignature } from "./hooks";
import { AsyncStorage } from "@utils";
import { keyStoreLedgerBluetoothId } from "@config/settingsKeys";
import Transport from "@ledgerhq/hw-transport";

export const IS_LEDGER_SUPPORTED: boolean = true;

export type LedgerTransportType = "usb" | "bluetooth";

export type SBPLedgerContextType = SBPHardwareWalletContextType & {
  setTransport: (transport: LedgerTransportType) => void;
};

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

  const _setWallet = useCallback((value: Btc) => {
    setTransport(value._transport);
    setWallet(value);
    setState(HardwareState.Signature);
  }, []);

  const _setTransport = useCallback(
    async (value: LedgerTransportType) => {
      setState(HardwareState.Connect);

      try {
        if (value === "usb") {
          const transport = await TransportRNHID.create();
          const ledger = new Btc({
            transport: transport,
            scrambleKey: "BTC",
            currency: "bitcoin"
          });
          setTransport(transport);
          _setWallet(ledger);
        } else if (value === "bluetooth") {
          setState(HardwareState.SelectDevice);
        }
      } catch (e) {
        error(e.message);
      }
    },
    [_setWallet, error]
  );

  const onDisconnect = useCallback(() => {
    setState(HardwareState.Connect);
  }, []);

  const close = useCallback(async () => {
    const ledgerBluetoothId = await AsyncStorage.getItem(
      keyStoreLedgerBluetoothId
    );
    if (ledgerBluetoothId) {
      await TransportRNBLE.disconnectDevice(ledgerBluetoothId);
    }
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
        setWallet: _setWallet,
        wallet,
        ...signatureFunctions
      }}
    >
      {children}
    </SBPLedgerContext.Provider>
  );
};
