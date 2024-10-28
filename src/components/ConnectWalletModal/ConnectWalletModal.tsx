import React, {
  ComponentProps,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { UseFormSetValue, useForm } from "react-hook-form";
import { useToast } from "react-native-toast-notifications";
import { AsyncStorage } from "@utils";
import {
  keyStoreUserType,
  keyStoreWalletType,
  keyStoreZpub
} from "@config/settingsKeys";
import { UserType } from "@types";
import { SBPBitboxContext } from "@config";
import { useBitboxBridge } from "@hooks/useBitboxBridge";
import {
  Connect as ConnectScreen,
  Bootloader as BootloaderScreen,
  Connected as ConnectedScreen,
  Pairing as PairingScreen,
  Signature as SignatureScreen,
  Setup as SetupScreen,
  AfterUpgrade as AfterUpgradeScreen,
  AfterSetup as AfterSetupScreen
} from "./components";
import { TStatus as BootloaderStatus } from "@utils/Bitbox/api/bitbox02bootloader";
import { TStatus as Status } from "@utils/Bitbox/api/bitbox02";
import { SignatureData } from "@components/PayoutConfig/components/BitcoinSettings/BitcoinSettings";
import { XOR } from "ts-essentials";
import { PairedBitBox } from "bitbox-api";
import { ACCESS_CONTROL } from "react-native-keychain";

type ConnectWalletForm = {
  zPub: string;
  message: string;
  signature: string;
};

type ConnectWalletModalProps = Omit<
  ComponentProps<typeof Modal>,
  "children" | "onClose"
> & {
  onClose: (signatureData?: SignatureData) => void;
};

export type ConnectWalletComponentProps = {
  deviceId?: string | PairedBitBox;
  status: XOR<BootloaderStatus, Status>;
  onClose: (isFinished: boolean) => void;
  setValue: UseFormSetValue<ConnectWalletForm>;
};

export enum WalletConnectState {
  Connect,
  Bootloader,
  Connected,
  Pairing,
  Setup,
  Signature
}

export const ConnectWalletModal = ({
  isOpen,
  onClose,
  ...props
}: ConnectWalletModalProps) => {
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "connectWalletModal" });
  const { deviceId, deviceMode, status } = useBitboxBridge();
  const {
    setIsBitboxServerRunning,
    setAfterSetupMode,
    isAfterUpgradeScreen,
    afterSetupMode
  } = useContext(SBPBitboxContext);
  const [state, setState] = useState(WalletConnectState.Connect);

  useEffect(() => {
    if (deviceMode === "bitbox02-bootloader") {
      setState(WalletConnectState.Bootloader);
    } else if (deviceMode === "bitbox02") {
      switch (status) {
        case "connected":
          setState(WalletConnectState.Connected);
          break;
        case "unpaired":
        case "pairingFailed":
          setState(WalletConnectState.Pairing);
          break;
        case "uninitialized":
        case "seeded":
          setState(WalletConnectState.Setup);
          break;
        case "initialized":
          setState(WalletConnectState.Signature);
          break;
      }
    } else if (!status) {
      setState(WalletConnectState.Connect);
    }
  }, [deviceMode, status]);

  const { Component, buttonProps } = useMemo<{
    Component: React.ElementType<ConnectWalletComponentProps>;
    buttonProps?: Omit<ComponentProps<typeof Modal>["submitButton"], "onPress">;
  }>(() => {
    if (isAfterUpgradeScreen) {
      return { Component: AfterUpgradeScreen };
    } else {
      switch (state) {
        case WalletConnectState.Connect:
          return { Component: ConnectScreen };
        case WalletConnectState.Bootloader:
          return { Component: BootloaderScreen };
        case WalletConnectState.Connected:
          return { Component: ConnectedScreen };
        case WalletConnectState.Pairing:
          return { Component: PairingScreen };
        case WalletConnectState.Setup:
          return { Component: SetupScreen };
        case WalletConnectState.Signature:
          if (afterSetupMode) {
            return {
              Component: AfterSetupScreen,
              ...(afterSetupMode !== "sdcard"
                ? {
                    buttonProps: {
                      title: t("iUnderstand"),
                      onPress: () => {
                        setAfterSetupMode(undefined);
                      }
                    }
                  }
                : {})
            };
          } else {
            return { Component: SignatureScreen };
          }
      }
    }
  }, [afterSetupMode, isAfterUpgradeScreen, setAfterSetupMode, state, t]);

  const { watch, setValue, reset } = useForm<ConnectWalletForm>({
    mode: "onTouched"
  });

  const handleOnClose = useCallback(
    async (withData = false) => {
      if (withData === true) {
        const data = watch();
        await AsyncStorage.setItem(
          keyStoreZpub,
          data.zPub,
          ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
        );
        await AsyncStorage.setItem(keyStoreUserType, UserType.Wallet);
        await AsyncStorage.setItem(keyStoreWalletType, "bitbox02");
        onClose({ ...data, walletType: "bitbox02" });
        toast.show(t("connectionSuccess"), {
          type: "success"
        });
      } else {
        onClose();
      }
      setTimeout(() => {
        setState(WalletConnectState.Connect);
        reset();
      }, 500);
    },
    [onClose, reset, t, toast, watch]
  );

  useEffect(() => {
    setIsBitboxServerRunning(isOpen);
  }, [isOpen]);

  return (
    <Modal
      {...props}
      isOpen={isOpen}
      submitButton={buttonProps}
      onClose={handleOnClose}
    >
      <Component
        deviceId={deviceId}
        status={status}
        onClose={handleOnClose}
        setValue={setValue}
      />
    </Modal>
  );
};
