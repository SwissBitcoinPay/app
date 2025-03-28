import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ComponentStack,
  FieldDescription,
  Loader,
  TextField
} from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import * as ConnectStyled from "../../styled";
import {
  checkSDCard,
  createBackup,
  errUserAbort,
  getDeviceInfo,
  insertSDCard,
  setDeviceName,
  setPassword
} from "@utils/Bitbox/api/bitbox02";
import { useToast } from "react-native-toast-notifications";
import { Platform } from "react-native";
import {
  BackupMode,
  SBPHardwareWalletContext
} from "@config/SBPHardwareWallet";
import { SBPBitboxContextType } from "@config/SBPHardwareWallet/hardware/bitbox02";

export const Setup = ({ deviceId, onClose }: ConnectWalletComponentProps) => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.setup"
  });

  const toast = useToast();
  const [tmpBackupMode, setTmpBackupMode] = useState<BackupMode>();
  const [hasSdCard, setHasSdCard] = useState(false);
  const [withAdvancedOptions, setWithAdvancedOptions] = useState(false);
  const defaultBitboxName = useMemo(() => t("myBitbox"), [t]);
  const [bitboxName, setBitboxName] = useState(defaultBitboxName);

  const { setAttentionToHardware, setBackupMode } =
    useContext<SBPBitboxContextType>(SBPHardwareWalletContext);

  useEffect(() => {
    if (Platform.OS === "web") {
      onClose();
      toast.show(t("uninitBitboxNoWeb"), { type: "info" });
    }
  }, []);

  const [status, setStatus] = useState<
    | "choose-backup-mode"
    | "set-device-name"
    | "set-password"
    | "create-backup"
    | "create-account"
  >("choose-backup-mode");

  const onSdCardPress = useCallback(async () => {
    try {
      const initalHasSdCard = await checkSDCard(deviceId);
      setHasSdCard(initalHasSdCard);
      setTmpBackupMode("sdcard");
      if (initalHasSdCard) {
        return;
      }

      setAttentionToHardware?.(true);
      const result = await insertSDCard(deviceId);

      if (result.success) {
        setAttentionToHardware?.(false);
        setHasSdCard(true);
      } else {
        toast.show(result.message || t("sdcardDetectionError"), {
          type: "error"
        });
      }
    } catch (e) {
      toast.show(t("sdcardDetectionError"), { type: "error" });
    }
  }, [deviceId, setAttentionToHardware, t, toast]);

  const makeBackup = useCallback(async () => {
    if (tmpBackupMode) {
      setStatus("create-backup");
      try {
        setBackupMode(tmpBackupMode);
        setAttentionToHardware?.(true);
        const result = await createBackup(
          deviceId,
          tmpBackupMode.includes("words") ? "recovery-words" : "sdcard"
        );

        if (!result.success) {
          throw new Error(
            result.code === errUserAbort
              ? t("createBackupAborted")
              : result.message || t("createBackupFailed")
          );
        } else {
          setAttentionToHardware?.(false);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }, [tmpBackupMode, deviceId, setBackupMode, setAttentionToHardware, t]);

  const ensurePassword = useCallback(async () => {
    setStatus("set-password");
    setAttentionToHardware?.(true);
    const result = await setPassword(
      deviceId,
      tmpBackupMode === "12-words" ? 16 : 32
    );
    if (!result.success) {
      throw new Error(
        result.code === errUserAbort
          ? t("setPasswordAborted")
          : result.message || t("setPasswordFailed")
      );
    } else {
      setAttentionToHardware?.(false);
    }
  }, [tmpBackupMode, deviceId, setAttentionToHardware, t]);

  const ensureDeviceName = useCallback(async () => {
    const deviceInfo = await getDeviceInfo(deviceId);
    if (
      deviceInfo.success &&
      (!deviceInfo.deviceInfo.name || deviceInfo.deviceInfo.name !== bitboxName)
    ) {
      let setNameSuccess = false;
      setStatus("set-device-name");

      while (!setNameSuccess) {
        setAttentionToHardware?.(true);
        const setName = await setDeviceName(deviceId, bitboxName);
        setAttentionToHardware?.(false);
        if (setName.success) {
          setNameSuccess = true;
        } else {
          throw new Error(setName.message || tRoot("errors.unknown"));
        }
      }
    }
  }, [bitboxName, deviceId, setAttentionToHardware, tRoot]);

  useEffect(() => {
    (async () => {
      try {
        if (
          (tmpBackupMode === "sdcard" && hasSdCard) ||
          (tmpBackupMode && tmpBackupMode !== "sdcard")
        ) {
          await ensureDeviceName();
          await ensurePassword();
          await makeBackup();
        }
      } catch (e: Error) {
        setAttentionToHardware?.(false);
        setStatus("choose-backup-mode");
        setTmpBackupMode(undefined);
        toast.show((e as Error).message || t("createBackupFailed"), {
          type: "error"
        });
      }
    })();
  }, [tmpBackupMode, hasSdCard]);

  return (
    <ConnectStyled.ComponentStack gapSize={10}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      {status === "choose-backup-mode" ? (
        !tmpBackupMode ? (
          <ComponentStack>
            <FieldDescription style={{ textAlign: "center" }}>
              {t("instruction1")}
            </FieldDescription>
            <Button
              type="bitcoin"
              title={t("sdcard")}
              onPress={onSdCardPress}
            />
            <Button
              noShadow
              size="small"
              type="primary"
              title={t("advancedOptions")}
              onPress={() => {
                setWithAdvancedOptions(!withAdvancedOptions);
              }}
            />
            {withAdvancedOptions && (
              <ComponentStack gapSize={10}>
                <TextField
                  label={t("bitboxName")}
                  onChangeText={setBitboxName}
                  value={bitboxName}
                />
                <Button
                  title={t("24words")}
                  onPress={() => {
                    setTmpBackupMode("24-words");
                  }}
                />
                <Button
                  title={t("12words")}
                  onPress={() => {
                    setTmpBackupMode("12-words");
                  }}
                />
              </ComponentStack>
            )}
          </ComponentStack>
        ) : tmpBackupMode === "sdcard" ? (
          hasSdCard ? null : (
            <FieldDescription>{t("insertSdCard")}</FieldDescription>
          )
        ) : null
      ) : status === "set-password" ? (
        <ComponentStack gapSize={10}>
          <FieldDescription>🔒 {t("setPassword1")}</FieldDescription>
          <FieldDescription>🔓 {t("setPassword2")}</FieldDescription>
        </ComponentStack>
      ) : status === "create-backup" ? (
        <Loader reason={t("creatingWallet")} />
      ) : status === "set-device-name" ? (
        <FieldDescription style={{ textAlign: "center" }}>
          {t("confirmName1")} <ConnectStyled.CheckIcon /> {t("confirmName2")}
        </FieldDescription>
      ) : null}
    </ConnectStyled.ComponentStack>
  );
};
