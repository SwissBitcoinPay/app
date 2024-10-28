import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription } from "@components";
import { StepProps } from "../../CreateWalletModal";
import * as S from "./styled";

export const Step1 = ({ setIsValid }: StepProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "createWalletModal.step1"
  });

  useEffect(() => {
    setIsValid(true);
  }, []);

  return (
    <ComponentStack gapSize={10}>
      <S.StepTitle>⚠️ {t("instructions_title")}</S.StepTitle>

      <FieldDescription>👝 {t("instructions1")}</FieldDescription>
      <FieldDescription>📄 {t("instructions2")}</FieldDescription>
      <FieldDescription>🕵 {t("instructions3")}</FieldDescription>
      <FieldDescription>🗝️ {t("instructions4")}</FieldDescription>
    </ComponentStack>
  );
};
