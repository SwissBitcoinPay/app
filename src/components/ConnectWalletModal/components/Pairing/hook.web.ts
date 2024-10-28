import { SBPBitboxContext } from "@config";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "react-native-toast-notifications";

export const usePairing = () => {
  const { setAttentionToBitbox, setPairedBitbox, pairingCode, pairingBitbox } =
    useContext(SBPBitboxContext);
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.pairing"
  });

  const toast = useToast();

  useEffect(() => {
    (async () => {
      setAttentionToBitbox(true);
      try {
        const pairedBitbox = await pairingBitbox.waitConfirm();
        setPairedBitbox(pairedBitbox);
      } catch (e) {
        toast.show(t("pairingFailed"), { type: "error" });
      }
      setAttentionToBitbox(false);
    })();
  }, []);

  return { hash: pairingCode };
};
