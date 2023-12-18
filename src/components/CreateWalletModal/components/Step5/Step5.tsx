import { useEffect } from "react";
import { useTheme } from "styled-components";
import { Text } from "@components";
import { useTranslation } from "react-i18next";
import { StepProps } from "../../CreateWalletModal";
import * as S from "./styled";

export const Step5 = ({ setIsValid }: StepProps) => {
  const { colors } = useTheme();

  const { t } = useTranslation(undefined, {
    keyPrefix: "createWalletModal.step5"
  });

  useEffect(() => {
    setIsValid(true);
  }, []);

  return (
    <S.StepComponentStack>
      <>
        <Text weight={700} color={colors.success}>
          {t("instructions1")}
        </Text>
        <S.LottieSuccess
          autoPlay
          loop={false}
          source={require("@assets/animations/success_wallet.json")}
        />
      </>
      <S.CenteredFieldDescription color={colors.warning}>
        ⚠️ {t("instructions2")}
      </S.CenteredFieldDescription>
    </S.StepComponentStack>
  );
};
