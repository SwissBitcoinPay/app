import * as _bitbox from "bitbox-api";
import { useCallback, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, Loader } from "@components";
import { SBPBitboxContext } from "@config";
import * as ConnectStyled from "../../styled";
import { ConnectWalletComponentProps } from "@components/ConnectWalletModal/ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";

export const Connect = ({ onClose }: ConnectWalletComponentProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connect"
  });

  const { setUnpaired } = useContext(SBPBitboxContext);

  const toast = useToast();

  const onDisconnect = useCallback(() => {
    onClose();
    toast.show(t("disconnected"), { type: "error" });
  }, [onClose, t, toast]);

  useEffect(() => {
    (async () => {
      try {
        const bitbox: typeof _bitbox = await _bitbox.default;
        const unpaired = await bitbox.bitbox02ConnectAuto(onDisconnect);
        setUnpaired?.(unpaired);
      } catch (e) {
        onClose();
        toast.show(`${e.message}. ${t("updateBitbox")}.`, { type: "error" });
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
