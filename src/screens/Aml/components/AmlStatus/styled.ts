import { Icon, Text, View } from "@components";
import styled from "styled-components";

export const AmlStatusContainer = styled(View)`
  width: 100%;
  align-items: center;
  padding-top: 20px;
  padding-bottom: 60px;
`;

export const StepsContainer = styled(View)`
  flex-direction: row;
  width: 80%;
  position: relative;

  justify-content: space-between;
  align-items: center;
`;

const STEP_CIRCLE_SIZE = 22;

export const StepCircle = styled(View)<{
  enabled: boolean;
  isCurrentStep: boolean;
}>`
  background-color: ${({ theme, enabled }) =>
    !enabled ? theme.colors.grey : theme.colors.bitcoin};
  border: 3px solid ${({ theme }) => theme.colors.primary};

  ${({ isCurrentStep }) => {
    const ratio = isCurrentStep ? 1 : 1;

    return `
      width: ${STEP_CIRCLE_SIZE * ratio}px;
      height: ${STEP_CIRCLE_SIZE * ratio}px;
      border-radius: ${(STEP_CIRCLE_SIZE * ratio) / 2}px;
      scale: ${isCurrentStep ? 1.3 : 1};
    `;
  }}
`;

export const StepText = styled(Text)`
  position: absolute;
`;

export const StepIcon = styled(Icon)`
  position: absolute;
`;

export const BackgroundBarContainer = styled(View)`
  position: absolute;
  padding-left: ${STEP_CIRCLE_SIZE / 2}px;
  padding-right: ${STEP_CIRCLE_SIZE / 2}px;
  width: 100%;
  height: 33%;
`;

export const BackgroundBarBackground = styled(View)`
  background-color: ${({ theme }) => theme.colors.grey};
  flex: 1;
`;

export const BackgroundBar = styled(View)<{ progress: number }>`
  height: 100%;
  width: ${({ progress }) => progress * 100}%;
  background-color: ${({ theme }) => theme.colors.bitcoin};
`;
