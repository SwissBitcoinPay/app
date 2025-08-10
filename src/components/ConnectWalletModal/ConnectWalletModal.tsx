import React, {
  ComponentProps,
  useCallback,
  useContext,
  useEffect,
  useMemo
} from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { UseFormSetValue, useForm } from "react-hook-form";
import { AsyncStorage, hardwareNames, sleep } from "@utils";
import { keyStoreUserType } from "@config/settingsKeys";
import { UserType } from "@types";
import {
  Empty as EmptyScreen,
  Connect as ConnectScreen,
  Transport as TransportScreen,
  SelectDevice as SelectDeviceScreen,
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
import { XOR } from "ts-essentials";
import { PairedBitBox } from "bitbox-api";
import {
  HardwareState,
  HardwareType,
  SBPHardwareWalletContext
} from "@config/SBPHardwareWallet";
import { HardwareWallet } from "@utils/wallet/types";
import { WalletType } from "@components/PayoutConfig/PayoutConfig";

export type WalletConfig = {
  account: string;
  label: string;
  path?: string;
  type: WalletType;
  zpub?: string;
  fingerprint?: string;
};

type ConnectWalletForm = {
  zPub: string;
  path: string;
  message: string;
  signature: string;
  walletConfig: WalletConfig;
};

export type CustomFunctionType = (
  params: HardwareReadyFunctionParams
) => Promise<{ messageToSign: string } | void>;

type ConnectWalletModalProps = Omit<
  ComponentProps<typeof Modal>,
  "children" | "onClose" | "title"
> & {
  onClose: (
    signatureData?: ConnectWalletForm & { walletType: HardwareType }
  ) => void;
  customFunction?: CustomFunctionType;
  walletType?: WalletType;
};

export type HardwareReadyFunctionParams = {
  account: string;
  xPub: string;
  wallet?: HardwareWallet;
};

export type ConnectWalletComponentProps = {
  deviceId?: string | PairedBitBox;
  status: XOR<BootloaderStatus, Status>;
  onClose: (isFinished: boolean) => void;
  setValue: UseFormSetValue<ConnectWalletForm>;
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
  walletType,
  ...props
}: ConnectWalletModalProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: "connectWalletModal" });
  const {
    init,
    close,
    state,
    setHardwareType,
    hardwareType,
    screenComponentProps = {},
    isHardwareUpgraded
  } = useContext(SBPHardwareWalletContext);

  const {
    Component,
    componentProps = {},
    buttonProps
  } = useMemo<{
    Component: React.ElementType<ConnectWalletComponentProps>;
    buttonProps?: Omit<ComponentProps<typeof Modal>["submitButton"], "onPress">;
  }>(() => {
    if (!hardwareType) {
      return { Component: EmptyScreen };
    } else if (isHardwareUpgraded) {
      return { Component: AfterUpgradeScreen };
    } else {
      switch (state) {
        case HardwareState.Connect:
          return { Component: ConnectScreen };
        case HardwareState.Transport:
          return { Component: TransportScreen };
        case HardwareState.SelectDevice:
          return { Component: SelectDeviceScreen };
        case HardwareState.Bootloader:
          return { Component: BootloaderScreen };
        case HardwareState.Connected:
          return { Component: ConnectedScreen };
        case HardwareState.Pairing:
          return { Component: PairingScreen };
        case HardwareState.Setup:
          return { Component: SetupScreen, ...screenComponentProps };
        case HardwareState.AfterSetup:
          return { Component: AfterSetupScreen, ...screenComponentProps };
        case HardwareState.Signature:
          return {
            Component: SignatureScreen,
            ...screenComponentProps,
            componentProps: {
              ...(screenComponentProps.componentProps || {}),
              customFunction
            }
          };
        default:
          return {};
      }
    }
  }, [
    hardwareType,
    isHardwareUpgraded,
    state,
    screenComponentProps,
    customFunction
  ]);

  const { watch, setValue, reset } = useForm<ConnectWalletForm>({
    mode: "onTouched"
  });

  useEffect(() => {
    if (hardwareType) {
      init?.();
    } else {
      close?.();
    }
  }, [!!hardwareType]);

  useEffect(() => {
    if (isOpen && Object.keys(hardwareNames).includes(walletType)) {
      setHardwareType(walletType);
    }
  }, [isOpen]);

  const handleOnClose = useCallback(
    async (withData = false) => {
      if (withData === true) {
        const data = watch();
        await AsyncStorage.setItem(keyStoreUserType, UserType.Wallet);
        onClose({ ...data, walletType: hardwareType });
      } else {
        onClose();
      }
      await sleep(500);
      setHardwareType(undefined);
      reset();
    },
    [hardwareType, onClose, reset, setHardwareType, watch]
  );

  useEffect(() => {
    if (isOpen) {
      init?.();
    } else {
      close?.();
    }
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
          onClose={handleOnClose}
          setValue={setValue}
          {...componentProps}
        />
      )}
    </Modal>
  );
};
