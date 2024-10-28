import { useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FieldDescription, ProgressBar, View } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import * as ConnectStyled from "../../styled";
import {
  TStatus,
  getVersionInfo,
  upgradeFirmware
} from "@utils/Bitbox/api/bitbox02bootloader";
import { SBPBitboxContext } from "@config";

export const Bootloader = ({
  deviceId,
  status
}: Omit<ConnectWalletComponentProps, "status"> & { status: TStatus }) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.bootloader"
  });

  const { setIsAfterUpgradeScreen } = useContext(SBPBitboxContext);

  const updateProgress = useMemo(
    () => status?.progress || 0,
    [status?.progress]
  );

  useEffect(() => {
    (async () => {
      const ret = await getVersionInfo(deviceId);
      if (ret.erased || ret.canUpgrade) {
        try {
          await upgradeFirmware(deviceId);
          setIsAfterUpgradeScreen(true);
        } catch (e) {}
      }
    })();
  }, []);

  return (
    <ConnectStyled.ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <View style={{ width: "100%" }}>
        <ProgressBar
          progress={updateProgress}
          text={`${Math.round(updateProgress * 100)}%`}
          isTextCentered
        />
      </View>
      <FieldDescription style={{ textAlign: "center" }}>
        ⚙️ {t("instruction1")}
      </FieldDescription>
      <FieldDescription style={{ textAlign: "center" }}>
        ⚠️ {t("instruction2")}
      </FieldDescription>
    </ConnectStyled.ComponentStack>
  );
};
