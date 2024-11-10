import * as _bitbox from "bitbox-api";
import { useCallback, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, Loader } from "@components";
import { SBPBitboxContext } from "@config";
import * as ConnectStyled from "../../styled";
import {
  ConnectWalletComponentProps,
  WalletConnectState
} from "@components/ConnectWalletModal/ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";

let bitbox: typeof _bitbox;

export const Connect = ({ onClose, setState }: ConnectWalletComponentProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connect"
  });

  const { setUnpaired, pairedBitbox } = useContext(SBPBitboxContext);

  const toast = useToast();

  const onDisconnect = useCallback(() => {
    setState(WalletConnectState.Connect);
  }, [setState]);

  useEffect(() => {
    (async () => {
      try {
        if (!bitbox) {
          bitbox = await _bitbox.default;
        }
        const unpaired = await bitbox.bitbox02ConnectAuto(onDisconnect);
        setUnpaired?.(unpaired);
      } catch (e) {
        if (!pairedBitbox) {
          toast.show(`${e.message}. ${t("updateBitbox")}.`, { type: "error" });
        }
        onClose();
      }
    })();
  }, []);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <Loader reason={t("connecting")} />
    </ComponentStack>
  );
};
