import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription, Loader } from "@components";
import { ConnectWalletComponentProps } from "../../ConnectWalletModal";
import * as S from "./styled";
import * as ConnectStyled from "../../styled";
import { useTheme } from "styled-components";
import { usePairing } from "./hook";

export const Pairing = ({ deviceId }: ConnectWalletComponentProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.pairing"
  });
  const { colors } = useTheme();

  const { hash } = usePairing(deviceId);

  return (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>{t("title")}</ConnectStyled.Title>
      <FieldDescription>{t("instruction")}</FieldDescription>
      {hash ? (
        <>
          <S.HashContainer style={{ alignItems: "center" }}>
            {hash.split("\n").map((hashSplit) => (
              <FieldDescription
                key={hashSplit}
                color={colors.white}
                style={{ fontFamily: "SpaceMono-Bold" }}
              >
                {hashSplit}
              </FieldDescription>
            ))}
          </S.HashContainer>
        </>
      ) : (
        <Loader />
      )}
      <FieldDescription>
        {t("confirm1")} <ConnectStyled.CheckIcon /> {t("confirm2")}
      </FieldDescription>
    </ComponentStack>
  );
};
