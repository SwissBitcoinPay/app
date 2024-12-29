import styled from "styled-components";
import {
  Icon,
  PageContainer,
  Text,
  View,
  ProgressBar as RootProgressBar,
  QR,
  Button,
  Image,
  ComponentStack,
  Pressable,
  Lottie
} from "@components";
import { platform } from "@config";
import { Circle } from "react-native-progress";
import { animated } from "@react-spring/native";

const { isNative } = platform;

type InvoicePageContainerProps = { isLoading: boolean };

export const InvoicePageContainer = styled(PageContainer).attrs(
  ({ isLoading }: InvoicePageContainerProps) => ({
    contentContainerStyle: {
      ...(isLoading
        ? { justifyContent: "center", paddingTop: 0 }
        : { alignItems: "flex-start" })
    }
  })
)<InvoicePageContainerProps>``;

export const LoaderText = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 700,
  color: theme.colors.white
}))``;

export const SectionsContainer = styled(ComponentStack)`
  flex-grow: 1;
`;

export const Section = styled(ComponentStack)<{ isOverflowVisible?: boolean }>`
  align-items: center;

  ${({ theme, isOverflowVisible }) => `
    padding: ${theme.gridSize}px ${theme.gridSize * 1.25}px;
    overflow: ${isOverflowVisible ? "visible" : "hidden"};
  `}
`;

export const TypeText = styled(Text).attrs(({ theme }) => ({
  weight: 600,
  h6: true,
  color: theme.colors.white
}))`
  display: flex;
  text-align: center;
  justify-content: center;
`;

export const PayByIcon = styled(({ style, children, ...props }) => {
  return <View style={style}>{children || <Icon {...props} />}</View>;
})`
  height: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding-left: 6px;
  padding-right: 4px;

  position: relative;
  padding-top: ${isNative ? 6 : 0}px;
`;

export const MainContentStack = styled(ComponentStack)<{
  size: number;
  borderColor?: string;
  isOverflowVisible?: boolean;
}>`
  align-items: center;
  justify-content: center;

  ${({ theme, size, borderColor, isOverflowVisible }) => `
    background: ${!borderColor ? theme.colors.white : "transparent"};
    border: 3px solid ${borderColor || theme.colors.greyLight};
    border-radius: ${theme.borderRadius}px;
    height: ${size}px;
    width: ${size}px;
    overflow: ${isOverflowVisible ? "visible" : "hidden"};
  `}
`;

export const ConfirmationsCircle = styled(Circle)`
  align-items: center;
  justify-content: center;
`;

export const ConfirmationsText = styled(Text).attrs(({ theme }) => ({
  h2: true,
  weight: 600,
  color: theme.colors.warning
}))`
  position: absolute;
`;

export const SuccessContainer = styled(View)`
  align-items: center;
  justify-content: center;
`;

export const SuccessLottie = styled(Lottie)<{ size: number }>`
  ${({ size }) => `
    height: ${size}px;
    width: ${size}px;
  `}
  transform: scale(1.35);
  z-index: 1;
`;

export const GreenCircle = styled(animated.View)`
  position: absolute;
  border-radius: 10000px;
  background-color: ${({ theme }) => theme.colors.success};
`;

export const TapAnywhereAction = styled(ComponentStack)`
  ${({ theme }) =>
    `
    border: 3px solid ${theme.colors.white};
    padding: ${theme.gridSize / 1.5}px ${theme.gridSize}px;
    border-radius: ${theme.borderRadius}px;
  `}
`;

const NFC_BUTTON_SIZE = 54;

export const NFCWrapper = styled(View)`
  position: relative;
  width: 100%;
  height: 0px;
`;

export const AskButton = styled(Pressable)<{ isLightOpacity: boolean }>`
  ${({ theme, disabled, isLightOpacity }) => `
    background: ${
      !disabled && !isLightOpacity ? theme.colors.white : "transparent"
    };
    border-radius: ${theme.borderRadius}px;
    ${
      isLightOpacity
        ? `opacity: 0.35; border: 2px solid ${theme.colors.white}; padding: 4px;`
        : ""
    }
  `}

  flex-direction: column;
  justify-content: center;
  align-items: center;
  align-self: flex-end;
  height: ${NFC_BUTTON_SIZE}px;
  width: ${NFC_BUTTON_SIZE}px;
`;

export const NFCImage = styled(Image)`
  width: 100%;
  height: 100%;
`;

export const NFCSwitchContainer = styled(View)`
  width: 12px;
  height: 6px;
  background-color: ${({ theme }) => theme.colors.grey};
  justify-content: center;
  border-radius: 3px;
  margin-bottom: 4px;
  align-items: flex-start;
  padding: 1px;
`;

export const NFCSwitchContainerCircle = styled(View)`
  background-color: ${({ theme }) => theme.colors.white};
  height: 4px;
  width: 4px;
  border-radius: 50%;
`;

type AmountTextProps = {
  subAmount?: boolean;
  color?: string;
};

export const AmountText = styled(Text).attrs<AmountTextProps>(
  ({ theme, subAmount, color }) => ({
    ...(subAmount ? { h4: true } : { h2: true }),
    weight: 700,
    color: color || theme.colors.white
  })
)<AmountTextProps>``;

export const BitcoinSlotText = styled(AmountText)`
  display: flex;
  margin-top: 16px;
`;

export const BitcoinSlotImage = styled(Image)`
  width: 20px;
  height: 20px;
  margin-right: 6px;
`;

export const ProgressBar = styled(RootProgressBar)`
  width: 90%;
`;

export const ActionButton = styled(Button)`
  flex-grow: 1;
  flex-shrink: 1;
`;

export const InvoiceQR = styled(QR)`
  padding: ${({ theme }) => theme.gridSize / 1.5}px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;

export const TapAnywhereCatcher = styled(Pressable)`
  position: absolute;
  height: 100%;
  width: 100%;
  background-color: transparent;
  align-items: center;
  justify-content: flex-end;
`;

export const TapAnywhereStack = styled(ComponentStack)`
  ${({ theme }) => `padding-horizontal: ${theme.gridSize}px;`}
`;

export const PoweredContainer = styled(ComponentStack)`
  align-items: center;
`;

export const PoweredBySBP = styled(Image)`
  height: 24px;
  aspect-ratio: 119 / 15;
`;
