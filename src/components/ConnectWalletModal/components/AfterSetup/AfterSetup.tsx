import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription, Icon } from "@components";
import { faSdCard, faVault } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "styled-components";
import * as ConnectStyled from "../../styled";
import { checkSDCard } from "@utils/Bitbox/api/bitbox02";
import { ConnectWalletComponentProps } from "@components/ConnectWalletModal/ConnectWalletModal";
import { SBPHardwareWalletContext } from "@config/SBPHardwareWallet";
import { SBPBitboxContextType } from "@config/SBPHardwareWallet/hardware/bitbox02";

export const AfterSetup = ({ deviceId }: ConnectWalletComponentProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.afterSetup"
  });
  const { t: tSecureWallet } = useTranslation(undefined, {
    keyPrefix: "secureWallet"
  });
  const { colors } = useTheme();
  const { backupMode, setBackupMode, setAttentionToHardware } =
    useContext<SBPBitboxContextType>(SBPHardwareWalletContext);

  useEffect(() => {
    setAttentionToHardware?.(false);

    if (backupMode === "sdcard") {
      const interval = setInterval(() => {
        (async () => {
          if (!(await checkSDCard(deviceId))) {
            setBackupMode(undefined);
          }
        })();
      }, 500);
      return () => {
        clearInterval(interval);
      };
    }
  }, []);

  return (
    <ComponentStack gapSize={10}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>

      <FieldDescription>
        <Icon
          icon={faVault}
          color={colors.greyLight}
          size={18}
          style={{ transform: [{ translateY: 5 }] }}
        />{" "}
        {t("instructions1", { backup: t(backupMode) })}
      </FieldDescription>
      <FieldDescription>
        ✅{" "}
        {tSecureWallet("instructions1", {
          backup: t(backupMode)
        })}
      </FieldDescription>
      <FieldDescription color={colors.warning}>
        ⚠️ {tSecureWallet("instructions2")}
      </FieldDescription>
      <FieldDescription color={colors.warning}>
        ⚠️ {tSecureWallet("instructions3", { backup: t(backupMode) })}
      </FieldDescription>
      <FieldDescription color={colors.warning}>
        ⚠️ {t("understand1", { backup: t(backupMode) })}
      </FieldDescription>
      <FieldDescription color={colors.warning}>
        ⚠️ {t("understand2", { backup: t(backupMode) })}
      </FieldDescription>
      <FieldDescription color={colors.warning}>
        ⚠️ {t("understand3", { backup: t(backupMode) })}
      </FieldDescription>
      {backupMode === "sdcard" && (
        <FieldDescription>
          <Icon
            icon={faSdCard}
            color={colors.greyLight}
            size={18}
            style={{ transform: [{ translateY: 5 }] }}
          />{" "}
          {t("removeSdCard")}
        </FieldDescription>
      )}
    </ComponentStack>
  );
};
