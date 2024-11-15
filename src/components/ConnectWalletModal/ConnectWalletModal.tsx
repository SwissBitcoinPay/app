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
import { AsyncStorage, sleep } from "@utils";
import {
  keyStoreUserType,
  keyStoreWalletPath,
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
  path: string;
  message: string;
  signature: string;
};

export type CustomFunctionType = (
  params: BitboxReadyFunctionParams
) => Promise<{ messageToSign: string } | void>;

type ConnectWalletModalProps = Omit<
  ComponentProps<typeof Modal>,
  "children" | "onClose" | "title"
> & {
  onClose: (signatureData?: SignatureData) => void;
  customFunction?: CustomFunctionType;
};

export type BitboxReadyFunctionParams = {
  account: string;
  xPub: string;
  bitbox?: PairedBitBox;
};

export type ConnectWalletComponentProps = {
  deviceId?: string | PairedBitBox;
  status: XOR<BootloaderStatus, Status>;
  onClose: (isFinished: boolean) => void;
  setValue: UseFormSetValue<ConnectWalletForm>;
  setState: (value: WalletConnectState) => void;
  customFunction?: CustomFunctionType;
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
  customFunction,
  ...props
}: ConnectWalletModalProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: "connectWalletModal" });
  const { deviceId, deviceMode, status } = useBitboxBridge();
  const [state, setState] = useState<WalletConnectState>();
  const {
    setIsBitboxServerRunning,
    setAfterSetupMode,
    isAfterUpgradeScreen,
    afterSetupMode
  } = useContext(SBPBitboxContext);

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
    } else if (!status && !!state) {
      setState(WalletConnectState.Connect);
    }
  }, [deviceMode, status]);

  const {
    Component,
    componentProps = {},
    buttonProps
  } = useMemo<{
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
            return {
              Component: SignatureScreen,
              componentProps: { customFunction }
            };
          }
        default:
          return {};
      }
    }
  }, [
    afterSetupMode,
    customFunction,
    isAfterUpgradeScreen,
    setAfterSetupMode,
    state,
    t
  ]);

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
        await AsyncStorage.setItem(keyStoreWalletPath, data.path);
        await AsyncStorage.setItem(keyStoreUserType, UserType.Wallet);
        await AsyncStorage.setItem(keyStoreWalletType, "bitbox02");
        onClose({ ...data, walletType: "bitbox02" });
      } else {
        onClose();
      }
      await sleep(500);
      setState(WalletConnectState.Connect);
      reset();
    },
    [onClose, reset, watch]
  );

  useEffect(() => {
    (async () => {
      await setIsBitboxServerRunning(isOpen);
      if (isOpen) {
        setState(WalletConnectState.Connect);
      }
    })();
  }, [isOpen]);

  return (
    <Modal
      {...props}
      isOpen={isOpen}
      submitButton={buttonProps}
      onClose={handleOnClose}
      title={t("title")}
    >
      {Component && (
        <Component
          deviceId={deviceId}
          status={status}
          onClose={handleOnClose}
          setValue={setValue}
          setState={setState}
          {...componentProps}
        />
      )}
    </Modal>
  );
};
