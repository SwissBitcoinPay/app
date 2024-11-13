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
import { SBPBitboxContext } from "@config";
import { Platform } from "react-native";

export type BackupMode = "sdcard" | "12-words" | "24-words";

export const Setup = ({ deviceId, onClose }: ConnectWalletComponentProps) => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.setup"
  });

  const toast = useToast();
  const [backupMode, setBackupMode] = useState<BackupMode>();
  const [hasSdCard, setHasSdCard] = useState(false);
  const [withAdvancedOptions, setWithAdvancedOptions] = useState(false);
  const defaultBitboxName = useMemo(() => t("myBitbox"), [t]);
  const [bitboxName, setBitboxName] = useState(defaultBitboxName);

  const { setAttentionToBitbox, setAfterSetupMode } =
    useContext(SBPBitboxContext);

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
      setBackupMode("sdcard");
      if (initalHasSdCard) {
        return;
      }

      setAttentionToBitbox(true);
      const result = await insertSDCard(deviceId);

      if (result.success) {
        setAttentionToBitbox(false);
        setHasSdCard(true);
      } else {
        toast.show(result.message || t("sdcardDetectionError"), {
          type: "error"
        });
      }
    } catch (e) {
      toast.show(t("sdcardDetectionError"), { type: "error" });
    }
  }, [deviceId, setAttentionToBitbox, t, toast]);

  const makeBackup = useCallback(async () => {
    if (backupMode) {
      setStatus("create-backup");
      try {
        setAfterSetupMode(backupMode);
        setAttentionToBitbox(true);
        const result = await createBackup(
          deviceId,
          backupMode.includes("words") ? "recovery-words" : "sdcard"
        );

        if (!result.success) {
          throw new Error(
            result.code === errUserAbort
              ? t("createBackupAborted")
              : result.message || t("createBackupFailed")
          );
        } else {
          setAttentionToBitbox(false);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }, [backupMode, deviceId, setAfterSetupMode, setAttentionToBitbox, t]);

  const ensurePassword = useCallback(async () => {
    setStatus("set-password");
    setAttentionToBitbox(true);
    const result = await setPassword(
      deviceId,
      backupMode === "12-words" ? 16 : 32
    );
    if (!result.success) {
      throw new Error(
        result.code === errUserAbort
          ? t("setPasswordAborted")
          : result.message || t("setPasswordFailed")
      );
    } else {
      setAttentionToBitbox(false);
    }
  }, [backupMode, deviceId, setAttentionToBitbox, t]);

  const ensureDeviceName = useCallback(async () => {
    const deviceInfo = await getDeviceInfo(deviceId);
    if (
      deviceInfo.success &&
      (!deviceInfo.deviceInfo.name || deviceInfo.deviceInfo.name !== bitboxName)
    ) {
      let setNameSuccess = false;
      setStatus("set-device-name");

      while (!setNameSuccess) {
        setAttentionToBitbox(true);
        const setName = await setDeviceName(deviceId, bitboxName);
        setAttentionToBitbox(false);
        if (setName.success) {
          setNameSuccess = true;
        } else {
          throw new Error(setName.message || tRoot("errors.unknown"));
        }
      }
    }
  }, [bitboxName, deviceId, setAttentionToBitbox, tRoot]);

  useEffect(() => {
    (async () => {
      try {
        if (
          (backupMode === "sdcard" && hasSdCard) ||
          (backupMode && backupMode !== "sdcard")
        ) {
          await ensureDeviceName();
          await ensurePassword();
          await makeBackup();
        }
      } catch (e: Error) {
        setAttentionToBitbox(false);
        setStatus("choose-backup-mode");
        setBackupMode(undefined);
        toast.show((e as Error).message || t("createBackupFailed"), {
          type: "error"
        });
      }
    })();
  }, [backupMode, hasSdCard]);

  return (
    <ConnectStyled.ComponentStack gapSize={10}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      {status === "choose-backup-mode" ? (
        !backupMode ? (
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
                    setBackupMode("24-words");
                  }}
                />
                <Button
                  title={t("12words")}
                  onPress={() => {
                    setBackupMode("12-words");
                  }}
                />
              </ComponentStack>
            )}
          </ComponentStack>
        ) : backupMode === "sdcard" ? (
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
