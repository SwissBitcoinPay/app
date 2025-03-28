import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack } from "@components";
import * as ConnectStyled from "../../styled";
import * as S from "./styled";
import {
  IS_BITBOX_SUPPORTED,
  IS_LEDGER_SUPPORTED,
  SBPHardwareWalletContext
} from "@config/SBPHardwareWallet";

export const Empty = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.empty"
  });

  const { setHardwareType } = useContext(SBPHardwareWalletContext);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <S.SelectHardwareContainer direction="horizontal">
        <S.HardwareContainer
          disabled={!IS_LEDGER_SUPPORTED}
          onPress={() => {
            setHardwareType("ledger");
          }}
        >
          <S.HardwareImage
            source={require("@assets/images/ledger.png")}
            style={{ aspectRatio: "3/1" }}
          />
          {!IS_LEDGER_SUPPORTED && (
            <S.NotSupportedText>
              {tRoot("common.notSupported")}
            </S.NotSupportedText>
          )}
        </S.HardwareContainer>
        <S.HardwareContainer
          disabled={!IS_BITBOX_SUPPORTED}
          onPress={() => {
            setHardwareType("bitbox02");
          }}
        >
          <S.HardwareImage
            source={require("@assets/images/bitbox.png")}
            style={{ aspectRatio: "337/83", transform: [{ scale: 0.8 }] }}
          />
          {!IS_BITBOX_SUPPORTED && (
            <S.NotSupportedText>
              {tRoot("common.notSupported")}
            </S.NotSupportedText>
          )}
        </S.HardwareContainer>
      </S.SelectHardwareContainer>
    </ComponentStack>
  );
};
