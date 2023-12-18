import { useCallback, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useLocation, useNavigate } from "@components/Router";
import { Image, Loader, PageContainer } from "@components";
import { PlaceholderPresetsTypes } from "@components/QRCamera/data";
import {
  faCameraRotate,
  faLightbulb as faLightbulbOn,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb as faLightbulbOff } from "@fortawesome/free-regular-svg-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CamerasConfig } from "@components/QRCamera/types";
import { useAccountConfig, useIsScreenSizeMin } from "@hooks";
import * as S from "./styled";

const imagePadding = 8;

type LocationState = {
  title: string;
  placeholderPreset: PlaceholderPresetsTypes;
};

export const QRScanner = () => {
  const { height: windowHeight } = useWindowDimensions();
  const isLarge = useIsScreenSizeMin("large");
  const insets = useSafeAreaInsets();
  const { onQrLogin, isLoading } = useAccountConfig({ refresh: false });

  const navigate = useNavigate();
  const location = useLocation<LocationState>();

  const { placeholderPreset, title } = location.state || {};

  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [deviceIndex, setDeviceIndex] = useState<number>();
  const [isTorchOn, setIsTorchOn] = useState(false);

  const [config, setConfig] = useState<CamerasConfig>();

  const holeSize = useMemo(() => 210, []);

  const _setConfig = useCallback(
    (newConfig: Partial<CamerasConfig>) => {
      if (deviceIndex === undefined) {
        setDeviceIndex(newConfig?.defaultIndex || 0);
      }
      setConfig({
        ...(config || { hasTorch: false, devicesNumber: 0, defaultIndex: -1 }),
        ...newConfig
      });
      setIsCameraLoading(false);
    },
    [config, deviceIndex]
  );

  const onScan = useCallback(
    async (value: string) => {
      if (await onQrLogin?.(value)) {
        navigate("/");
      }
    },
    [navigate, onQrLogin]
  );

  const onBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const onSwitchCamera = useCallback(() => {
    if (deviceIndex === undefined) return;

    if (deviceIndex + 1 < (config?.devicesNumber || 0)) {
      setDeviceIndex(deviceIndex + 1);
    } else {
      setDeviceIndex(0);
    }
  }, [deviceIndex, config?.devicesNumber]);


  const holeY = useMemo(
    () => (windowHeight + insets.top + insets.bottom) / 2 - holeSize / 2,
    [windowHeight, insets.top, insets.bottom, holeSize]
  );

  return (
    <>
      {!isLoading && (
        <S.Camera
          deviceIndex={deviceIndex}
          isTorchOn={isTorchOn}
          setConfig={_setConfig}
          onScan={onScan}
          videoHeight={isLarge ? windowHeight - 260 : "100%"}
        />
      )}
      {!isLoading && !isCameraLoading && placeholderPreset && (
        <Image
          source={placeholderPreset}
          style={{
            position: "absolute",
            opacity: 0.25,
            borderRadius: 12,
            top: holeY + imagePadding,
            height: holeSize - imagePadding * 2 - 1,
            width: holeSize - imagePadding * 2 - 1
          }}
        />
      )}
      <PageContainer noHorizontalPadding isStrictTopMargin>
        {!isCameraLoading && !isLoading ? (
          <>
            <S.VerticialPart>
              {title && <S.TitleText weight={700}>{title}</S.TitleText>}
            </S.VerticialPart>
            <S.VerticialPart isItemsBottom>
              <S.BottomButtons>
                <S.BottomButton
                  size="large"
                  disabled={!config?.hasTorch}
                  icon={isTorchOn ? faLightbulbOn : faLightbulbOff}
                  onPress={() => {
                    setIsTorchOn(!isTorchOn);
                  }}
                />
                <S.BottomButton
                  position="right"
                  icon={faTimes}
                  onPress={onBack}
                />
                {(config?.devicesNumber || 0) > 1 && (
                  <S.BottomButton
                    position="left"
                    icon={faCameraRotate}
                    onPress={onSwitchCamera}
                  />
                )}
              </S.BottomButtons>
            </S.VerticialPart>
          </>
        ) : (
          <Loader />
        )}
      </PageContainer>
    </>
  );
};
