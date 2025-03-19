import { useMemo } from "react";
import { BitcoinIcon } from "@components";
import {
  faClock,
  faFileInvoice,
  faIdCard
} from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "styled-components";
import { Clipboard } from "@utils";
import { IconName } from "@fortawesome/fontawesome-svg-core";
import { useTranslation } from "react-i18next";
import * as S from "./styled";

export type AmlInfoStatus =
  | "draft"
  | "kycDone"
  | "submitted"
  | "accepted"
  | "rejected";

type AmlStep = {
  enabled: boolean;
  text: string;
  icon: IconName;
};

type AmlStatusProps = {
  amlStatus: AmlInfoStatus;
};

export const AmlStatus = ({ amlStatus }: AmlStatusProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.kyc.status" });

  const steps: AmlStep[] = useMemo(
    () => [
      {
        text: t("identity"),
        icon: faIdCard
      },
      {
        text: t("documentation"),
        icon: faFileInvoice
      },
      {
        text: t("verification"),
        icon: faClock
      },
      {
        text: t("payment")
      }
    ],
    [t]
  );

  const stepsStatus = useMemo(() => {
    return steps.map((_, index) => {
      switch (index) {
        case 0:
          return [
            "draft",
            "kycDone",
            "submitted",
            "accepted",
            "rejected"
          ].includes(amlStatus);
        case 1:
          return ["kycDone", "submitted", "accepted", "rejected"].includes(
            amlStatus
          );
        case 2:
          return ["submitted", "accepted", "rejected"].includes(amlStatus);
        case 3:
          return ["accepted", "rejected"].includes(amlStatus);
        default:
          return false;
          break;
      }
    });
  }, [amlStatus, steps]);

  const barProgress = useMemo(() => {
    const step = 1 / (stepsStatus.length - 1);
    return stepsStatus
      .slice(1)
      .reduce((result, value) => (value ? result + step : result), 0);
  }, [stepsStatus]);

  return (
    <S.AmlStatusContainer>
      <S.StepsContainer>
        <S.BackgroundBarContainer>
          <S.BackgroundBarBackground>
            <S.BackgroundBar progress={barProgress} />
          </S.BackgroundBarBackground>
        </S.BackgroundBarContainer>
        {steps.map((step, index) => {
          const enabled = stepsStatus[index];
          const IconComp = step.icon ? S.StepIcon : BitcoinIcon;
          const isCurrentStep =
            stepsStatus.reduce((r, v, i) => (v ? i : r), 0) === index;

          const color = enabled ? colors.bitcoin : colors.grey;

          return (
            <S.StepCircle
              key={index}
              enabled={enabled}
              isCurrentStep={isCurrentStep}
            >
              <IconComp
                icon={step.icon}
                color={color}
                iconBackgroundColor={colors.primary}
                size={24}
                style={{
                  transform: "translate(-50%, 30px)",
                  left: "50%"
                }}
              />
              <S.StepText
                weight={600}
                h4
                color={color}
                style={{
                  transform: "translate(-50%, -30px)",
                  left: "50%",
                  textWrapMode: "nowrap"
                }}
              >
                {step.text}
              </S.StepText>
            </S.StepCircle>
          );
        })}
      </S.StepsContainer>
    </S.AmlStatusContainer>
  );
};
