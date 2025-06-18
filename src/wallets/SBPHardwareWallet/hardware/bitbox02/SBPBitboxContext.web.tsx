import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState
} from "react";
import * as _bitbox from "bitbox-api";
import { BitboxWallets, SBPBitboxContextType } from "./SBPBitboxContext";
import { BitBox, PairedBitBox, PairingBitBox } from "bitbox-api";
import { sleep } from "@utils";
import { useTranslation } from "react-i18next";
import { useSignature } from "./hooks";
import { useToast } from "react-native-toast-notifications";
import { HardwareState } from "@wallets/SBPHardwareWallet/SBPHardwareWalletContext";

let bitbox: typeof _bitbox;

export const IS_BITBOX_SUPPORTED = true;

// @ts-ignore
export const SBPBitboxContext = React.createContext<SBPBitboxContextType>({});

export const SBPBitboxContextProvider = ({ children }: PropsWithChildren) => {
  const [wallet, setWallet] = useState<BitboxWallets>();
  const [pairingHash, setPairingHash] = useState<string>();
  const [state, setState] = useState<HardwareState>();
  const { t } = useTranslation();

  const toast = useToast();

  const onDisconnect = useCallback(() => {
    setState(HardwareState.Connect);
  }, []);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const signatureFunctions = useSignature({
    wallet,
    error
  });

  const setAttentionToHardware = useCallback(() => {}, []);

  useEffect(() => {
    (async () => {
      if ((wallet as BitBox)?.unlockAndPair) {
        setState(HardwareState.Connected);

        const pairingBitbox: PairingBitBox = await (
          wallet as BitBox
        ).unlockAndPair();

        const pairingCode = pairingBitbox.getPairingCode();

        if (pairingCode) {
          setPairingHash(pairingCode);
        }
        setWallet(pairingBitbox);
      } else if ((wallet as PairingBitBox)?.waitConfirm) {
        setState(HardwareState.Pairing);
        setAttentionToHardware?.(true);
        try {
          const pairedBitbox = await (wallet as PairingBitBox).waitConfirm();
          setWallet(pairedBitbox);
        } catch (e) {
          toast.show(t("connectWalletModal.pairing.pairingFailed"), {
            type: "error"
          });
        }
        setAttentionToHardware?.(false);
      } else if ((wallet as PairedBitBox)?.deviceInfo) {
        const deviceInfo = await (wallet as PairedBitBox).deviceInfo();
        if (deviceInfo.initialized) {
          setState(HardwareState.Signature);
        } else {
          setState(HardwareState.Setup);
          (value as PairedBitBox).close();
          return;
        }
      }
    })();
  }, [wallet]);

  const init = useCallback(async () => {
    setState(HardwareState.Connect);
    try {
      if (!bitbox) {
        bitbox = await _bitbox.default;
      }
      const unpaired = await bitbox.bitbox02ConnectAuto(onDisconnect);
      setWallet(unpaired);
    } catch (e) {
      error(`${e.message}. ${t("connectWalletModal.connect.updateBitbox")}`);
    }
  }, [error, onDisconnect, t]);

  const close = useCallback(async () => {
    try {
      (wallet as PairedBitBox)?.close?.();
    } catch (e) {}
    await sleep(1000);
    setState(HardwareState.Connect);
    setWallet(undefined);
  }, [wallet]);

  return (
    <SBPBitboxContext.Provider
      value={{
        init,
        close,
        onDisconnect,
        setWallet,
        wallet,
        state,
        setAttentionToHardware,
        setPairingHash,
        pairingHash,
        ...signatureFunctions
      }}
    >
      {children}
    </SBPBitboxContext.Provider>
  );
};
