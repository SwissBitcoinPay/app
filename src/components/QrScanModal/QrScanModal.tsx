import { ComponentProps, useCallback, useState } from "react";
import { Button, ComponentStack, Loader, Modal } from "@components";
import { CamerasConfig } from "@components/QRCamera/types";
import {
  faCameraRotate,
  faLightbulb as faLightbulbOn
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb as faLightbulbOff } from "@fortawesome/free-regular-svg-icons";
import * as S from "./styled";

type QrScanModalProps = Omit<ComponentProps<typeof Modal>, "children"> & {
  onScan: (value: string) => void;
};

export const QrScanModal = ({
  onScan,
  onClose,
  ...props
}: QrScanModalProps) => {
  const [config, setConfig] = useState<CamerasConfig>();

  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceIndex, setDeviceIndex] = useState<number>();
  const [isTorchOn, setIsTorchOn] = useState(false);

  const onSwitchCamera = useCallback(() => {
    if (deviceIndex === undefined) return;

    if (deviceIndex + 1 < (config?.devicesNumber || 0)) {
      setDeviceIndex(deviceIndex + 1);
    } else {
      setDeviceIndex(0);
    }
  }, [deviceIndex, config?.devicesNumber]);

  const _setConfig = useCallback(
    (newConfig: Partial<CamerasConfig>) => {
      if (deviceIndex === undefined) {
        setDeviceIndex(newConfig?.defaultIndex || 0);
      }
      setIsCameraActive(true);
      setConfig({
        ...(config || {
          hasTorch: false,
          devicesNumber: 0,
          defaultIndex: -1
        }),
        ...newConfig
      });
      setIsLoading(false);
    },
    [config, deviceIndex]
  );

  const _onClose = useCallback(() => {
    setIsCameraActive(false);
    setTimeout(() => {
      onClose();
    }, 0);
  }, [onClose]);

  const _onScan = useCallback(
    (value: string) => {
      onScan(value);
      setIsCameraActive(false);
      onClose();
    },
    [onClose, onScan]
  );

  return (
    <Modal {...props} onClose={_onClose}>
      <ComponentStack>
        <S.Camera
          isActive={isCameraActive}
          deviceIndex={deviceIndex}
          isTorchOn={isTorchOn}
          setConfig={_setConfig}
          onScan={_onScan}
          videoHeight={400}
          resizeMode="contain"
        />
        {!isLoading ? (
          (config?.hasTorch || (config?.devicesNumber || 0) > 1) && (
            <S.BottomButtons direction="horizontal">
              {(config?.devicesNumber || 0) > 1 && (
                <Button icon={faCameraRotate} onPress={onSwitchCamera} />
              )}
              <Button
                disabled={!config?.hasTorch}
                icon={isTorchOn ? faLightbulbOn : faLightbulbOff}
                onPress={() => {
                  setIsTorchOn(!isTorchOn);
                }}
              />
            </S.BottomButtons>
          )
        ) : (
          <Loader />
        )}
      </ComponentStack>
    </Modal>
  );
};
