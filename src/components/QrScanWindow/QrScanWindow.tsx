import { useCallback, useState } from "react";
import { CamerasConfig } from "@components/QRCamera/types";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";

type QrScanWindowProps = {
  isOpen: boolean;
  onScan: (value: string) => void;
  onClose: () => void;
};

export const QrScanWindow = ({
  onScan,
  onClose,
  isOpen
}: QrScanWindowProps) => {
  const [config, setConfig] = useState<CamerasConfig>();
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [deviceIndex, setDeviceIndex] = useState<number>();

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
    isOpen && (
      <S.WindowContainer>
        <S.Camera
          isActive={isCameraActive}
          deviceIndex={deviceIndex}
          isTorchOn
          style={{}}
          setConfig={_setConfig}
          onScan={_onScan}
          videoHeight={300}
          resizeMode="contain"
        />
        <S.CloseButton icon={faTimes} onPress={_onClose} />
      </S.WindowContainer>
    )
  );
};
