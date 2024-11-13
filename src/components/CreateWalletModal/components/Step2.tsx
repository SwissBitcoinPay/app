import { useEffect, useState } from "react";
import { CheckboxField, ComponentStack, FieldDescription } from "@components";
import { useTranslation } from "react-i18next";
import { StepProps } from "../CreateWalletModal";
import { useTheme } from "styled-components";

export const Step2 = ({ setIsValid }: StepProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation(undefined, {
    keyPrefix: "createWalletModal.step2"
  });
    const { t: tSecureWallet } = useTranslation(undefined, {
      keyPrefix: "secureWallet"
    });
    const [agree1, setAgree1] = useState(false);
    const [agree2, setAgree2] = useState(false);
    const [agree3, setAgree3] = useState(false);

    useEffect(() => {
      setIsValid(agree1 && agree2 && agree3);
    }, [agree1, agree2, agree3]);

    return (
      <ComponentStack gapSize={10}>
        <FieldDescription>📋 {t("instructions1")}</FieldDescription>
        <FieldDescription>🛡️ {t("instructions2")}</FieldDescription>
        <FieldDescription>📝 {t("instructions3")}</FieldDescription>
        <FieldDescription>🗃️ {t("instructions4")}</FieldDescription>
        <FieldDescription>
          ✅ {tSecureWallet("instructions1", { backup: t("seedPhrase") })}
        </FieldDescription>
        <FieldDescription color={colors.warning}>
          ⚠️ {tSecureWallet("instructions2")}
        </FieldDescription>
        <FieldDescription color={colors.warning}>
          ⚠️ {tSecureWallet("instructions3", { backup: t("seedPhrase") })}
        </FieldDescription>
        <>
          <CheckboxField
            label={t("agree1")}
            value={agree1}
            onChange={({ nativeEvent: { value } }) => setAgree1(value)}
          />
          <CheckboxField
            label={t("agree2")}
            value={agree2}
            onChange={({ nativeEvent: { value } }) => setAgree2(value)}
          />
          <CheckboxField
            label={t("agree3")}
            value={agree3}
            onChange={({ nativeEvent: { value } }) => setAgree3(value)}
          />
        </>
      </ComponentStack>
    );
};
