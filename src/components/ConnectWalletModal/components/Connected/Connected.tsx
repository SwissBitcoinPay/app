import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Video from "react-native-video";
import { ComponentStack, FieldDescription } from "@components";
import * as ConnectStyled from "../../styled";
import { BitBox } from "bitbox-api";
import { SBPHardwareWalletContext } from "@config/SBPHardwareWallet";
import { SBPBitboxContextType } from "@config/SBPHardwareWallet/hardware/bitbox02";

export const Connected = () => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connected"
  });

  const { setAttentionToHardware } = useContext<SBPBitboxContextType<BitBox>>(
    SBPHardwareWalletContext
  );

  useEffect(() => {
    setAttentionToHardware?.(true);

    return () => {
      setAttentionToHardware?.(false);
    };
  }, []);

  return (
    <ComponentStack gapSize={10}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <Video
        source={{
          uri: require("@assets/videos/bitbox02-password-gestures.webm")
        }}
        repeat
        style={{ height: 216 }}
      />
      <FieldDescription style={{ textAlign: "center" }}>
        {t("instruction")}
      </FieldDescription>
    </ComponentStack>
  );
};
