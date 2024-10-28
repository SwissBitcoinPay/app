import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Video from "react-native-video";
import { ComponentStack, FieldDescription } from "@components";
import { SBPBitboxContext } from "@config";
import * as ConnectStyled from "../../styled";
import { Platform } from "react-native";
import { PairingBitBox } from "bitbox-api";

export const Connected = () => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connected"
  });

  const { setAttentionToBitbox, unpaired, setPairingCode, setPairingBitbox } =
    useContext(SBPBitboxContext);

  useEffect(() => {
    setAttentionToBitbox(true);

    return () => {
      setAttentionToBitbox(false);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && unpaired) {
      (async () => {
        const pairingBitbox: PairingBitBox = await unpaired.unlockAndPair();

        const pairingCode = pairingBitbox.getPairingCode();

        if (pairingCode) {
          setPairingCode(pairingCode);
        }
        setPairingBitbox(pairingBitbox);
      })();
    }
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
