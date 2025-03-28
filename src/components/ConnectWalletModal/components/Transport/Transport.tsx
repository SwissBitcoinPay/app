import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack } from "@components";
import * as ConnectStyled from "../../styled";
import * as S from "./styled";
import {
  SBPHardwareWalletContext,
  SBPLedgerContextType
} from "@config/SBPHardwareWallet";
import { faBluetoothB, faUsb } from "@fortawesome/free-brands-svg-icons";
import { platform } from "@config";

const { isIos, isAndroid, isWeb, isNative } = platform;

const isUsbAvailable = isAndroid || isWeb;
const isBluetoothAvailable = isNative && (isAndroid || isIos);

export const Transport = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.transport"
  });

  const { setTransport } = useContext<SBPLedgerContextType>(
    SBPHardwareWalletContext
  );

  useEffect(() => {
    if (isWeb) {
      if (isUsbAvailable && !isBluetoothAvailable) {
        setTransport("usb");
      } else if (isBluetoothAvailable && !isUsbAvailable) {
        setTransport("bluetooth");
      }
    }
  }, []);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <S.SelectTransportContainer direction="horizontal">
        <S.TransportContainer
          disabled={!isUsbAvailable}
          onPress={() => {
            setTransport("usb");
          }}
        >
          <S.TransportIcon icon={faUsb} />
          <S.TransportText>USB</S.TransportText>
          {!isUsbAvailable && (
            <S.NotSupportedText>
              {tRoot("common.notSupported")}
            </S.NotSupportedText>
          )}
        </S.TransportContainer>
        <S.TransportContainer
          disabled={!isBluetoothAvailable}
          onPress={() => {
            setTransport("bluetooth");
          }}
        >
          <S.TransportIcon icon={faBluetoothB} />
          <S.TransportText>Bluetooth</S.TransportText>
          {!isBluetoothAvailable && (
            <S.NotSupportedText>
              {tRoot("common.notSupported")}
            </S.NotSupportedText>
          )}
        </S.TransportContainer>
      </S.SelectTransportContainer>
    </ComponentStack>
  );
};
