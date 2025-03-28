import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ComponentStack, FieldDescription, Loader } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import { useToast } from "react-native-toast-notifications";
import TransportRNBLE from "@ledgerhq/react-native-hw-transport-ble";
import * as ConnectStyled from "../../styled";
import * as S from "./styled";
import { keyStoreLedgerBluetoothId } from "@config/settingsKeys";
import { AsyncStorage, hardwareNames } from "@utils";
import { SBPHardwareWalletContext } from "@config/SBPHardwareWallet";
import { PermissionsAndroid, Platform } from "react-native";
import Btc from "@ledgerhq/hw-app-btc";

export type Device = {
  id: string;
  name: string;
};

export const SelectDevice = ({ onClose }: ConnectWalletComponentProps) => {
  const toast = useToast();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.selectDevice"
  });
  const { t: tRoot } = useTranslation();

  const [isBluetoothAvailable, setIsBluetoothAvailable] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const { setWallet, hardwareType } = useContext(SBPHardwareWalletContext);

  const error = useCallback(
    (msg: string) => {
      toast.show(msg, { type: "error" });
    },
    [toast]
  );

  const [devices, setDevices] = useState<Device[]>([]);

  const requestBluetoothPermission = useCallback(async () => {
    if (Platform.OS === "ios") {
      return true;
    }
    if (
      Platform.OS === "android" &&
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ) {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN &&
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        ]);

        return (
          result["android.permission.BLUETOOTH_CONNECT"] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_SCAN"] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }

    error("Permission have not been granted");

    return false;
  }, [error]);

  useEffect(() => {
    (async () => {
      setHasPermissions(await requestBluetoothPermission());
    })();
  }, []);

  useEffect(() => {
    const subscription = TransportRNBLE.observeState({
      next: (e) => {
        setIsBluetoothAvailable(e.available);
      },
      complete: () => {},
      error: () => {}
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const onSelectDevice = useCallback(
    async (id: string) => {
      setIsConnecting(true);
      try {
        await AsyncStorage.setItem(keyStoreLedgerBluetoothId, id);
        const transport = await TransportRNBLE.open(id);
        const ledger = new Btc({
          transport: transport,
          scrambleKey: "BTC",
          currency: "bitcoin"
        });
        setWallet(ledger);
      } catch (e) {
        error(e?.message);
      }
      setIsConnecting(false);
    },
    [error, setWallet]
  );

  useEffect(() => {
    if (isBluetoothAvailable && hasPermissions) {
      const currentLedgerBluetoothId = await AsyncStorage.getItem(
        keyStoreLedgerBluetoothId
      );

      const subscription = TransportRNBLE.listen({
        complete: () => {},
        next: (e) => {
          if (e.type === "add") {
            const device: Device = {
              id: e.descriptor.id,
              name: e.descriptor.name
            };
            if (currentLedgerBluetoothId === device.id) {
              onSelectDevice(currentLedgerBluetoothId);
            }
            setDevices((oldState) => {
              if (oldState.find((d) => d.id === device.id)) {
                return oldState;
              } else {
                return [...oldState, device];
              }
            });
          }
        },
        error: (err) => {
          error(err.message);
          onClose();
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isBluetoothAvailable, hasPermissions]);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      {isConnecting ? (
        <Loader
          reason={t("connecting", {
            hardwareWallet: hardwareNames[hardwareType]
          })}
        />
      ) : devices.length > 0 ? (
        <ComponentStack>
          <FieldDescription style={{ textAlign: "center" }}>
            {t("selectDevice", { hardwareWallet: hardwareNames[hardwareType] })}
          </FieldDescription>
          <ComponentStack gapSize={16}>
            {devices.map((device, i) => (
              <S.DeviceContainer key={i}>
                <S.DeviceInfoContainer>
                  <S.DeviceTitle>{device.name}</S.DeviceTitle>
                </S.DeviceInfoContainer>
                <Button
                  size="small"
                  type="bitcoin"
                  title={t("select")}
                  onPress={() => {
                    onSelectDevice(device.id);
                  }}
                />
              </S.DeviceContainer>
            ))}
          </ComponentStack>
        </ComponentStack>
      ) : (
        <Loader reason={tRoot("common.loading")} />
      )}
    </ComponentStack>
  );
};
