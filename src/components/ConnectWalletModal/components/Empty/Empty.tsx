import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, Url } from "@components";
import * as ConnectStyled from "../../styled";
import * as S from "./styled";
import {
  IS_BITBOX_SUPPORTED,
  IS_LEDGER_SUPPORTED,
  IS_TREZOR_SUPPORTED,
  SBPHardwareWalletContext
} from "@config/SBPHardwareWallet";
import { useIsScreenSizeMin } from "@hooks";
import { hardwareNames } from "@utils";

export const Empty = () => {
  const isLarge = useIsScreenSizeMin("large");
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.empty"
  });

  const { setHardwareType } = useContext(SBPHardwareWalletContext);

  const imageRatio = useMemo(() => (isLarge ? 0.75 : 0.7), [isLarge]);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <S.SelectHardwareContainer
        direction={isLarge ? "horizontal" : "vertical"}
        gapSize={26}
      >
        <S.HardwareContainerWrapper>
          <S.HardwareContainer
            disabled={!IS_LEDGER_SUPPORTED}
            onPress={() => {
              setHardwareType("ledger");
            }}
          >
            <S.HardwareImage
              source={require("@assets/images/ledger.png")}
              style={{ aspectRatio: "3/1", transform: [{ scale: imageRatio }] }}
            />
            {!IS_LEDGER_SUPPORTED && (
              <S.NotSupportedText>
                {tRoot("common.notSupported")}
              </S.NotSupportedText>
            )}
          </S.HardwareContainer>
          <Url
            as={S.BuyHardwareText}
            title={`${t("buyHardware", { hardwareName: hardwareNames["ledger"] })} 🇫🇷`}
            href="https://shop.ledger.com/?r=1fbe532b2688&tracker=sbp-signup"
          />
        </S.HardwareContainerWrapper>
        <S.HardwareContainerWrapper>
          <S.HardwareContainer
            disabled={!IS_BITBOX_SUPPORTED}
            onPress={() => {
              setHardwareType("bitbox02");
            }}
          >
            <S.HardwareImage
              source={require("@assets/images/bitbox.png")}
              style={{
                aspectRatio: "337/83",
                transform: [{ scale: imageRatio * 0.8 }]
              }}
            />
            {!IS_BITBOX_SUPPORTED && (
              <S.NotSupportedText>
                {tRoot("common.notSupported")}
              </S.NotSupportedText>
            )}
          </S.HardwareContainer>
          <Url
            as={S.BuyHardwareText}
            title={`${t("buyHardware", { hardwareName: hardwareNames["bitbox02"] })} 🇨🇭`}
            href="https://shop.bitbox.swiss/?ref=KerwHOKfOK"
          />
        </S.HardwareContainerWrapper>
        <S.HardwareContainerWrapper>
          <S.HardwareContainer
            disabled={!IS_TREZOR_SUPPORTED}
            onPress={() => {
              setHardwareType("trezor");
            }}
          >
            <S.HardwareImage
              source={require("@assets/images/trezor.png")}
              style={{
                aspectRatio: "192/49",
                transform: [{ scale: imageRatio * 0.82 }]
              }}
            />
            {!IS_TREZOR_SUPPORTED && (
              <S.NotSupportedText>
                {tRoot("common.notSupported")}
              </S.NotSupportedText>
            )}
          </S.HardwareContainer>
          <Url
            as={S.BuyHardwareText}
            title={`${t("buyHardware", { hardwareName: hardwareNames["trezor"] })} 🇨🇿`}
            href="https://affil.trezor.io/aff_c?offer_id=235&aff_id=36313&source=sbp-signup"
          />
        </S.HardwareContainerWrapper>
      </S.SelectHardwareContainer>
    </ComponentStack>
  );
};
