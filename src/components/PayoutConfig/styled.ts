import styled from "styled-components";
import { View, Text, BitcoinIcon, Icon, Pressable, Button } from "@components";
import Slider from "@react-native-community/slider";
import { platform } from "@config";

const { isNative } = platform;

export const TitleText = styled(Text).attrs(() => ({
  h3: true,
  weight: 600
}))`
  align-items: flex-start;
  width: 100%;
  ${({ theme }) => `
    color: ${theme.colors.white};
  `}
`;

export const SliderContainer = styled(View)`
  ${({ theme }) => `
    background-color: ${theme.colors.white};
  `}
  width: 100%;
  padding: 0px ${isNative ? 2 : 14}px;
  border-radius: 100px;
`;

export const BtcPercentSlider = styled(Slider)`
  height: 30px;
`;

export const SliderDataContainer = styled(View)`
  position: relative;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
`;

export const SliderContentSide = styled(View)<{
  isTranslucent?: boolean;
  isRight?: boolean;
}>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  ${({ isTranslucent, isRight }) => `
    ${isTranslucent ? "opacity: 0.35;" : ""}
    ${isRight ? "align-items: flex-end;" : ""}
  `}
`;

export const ValueContent = styled(Pressable)<{ bgColor: string }>`
  width: 130px;
  padding: 8px 0px;
  margin-bottom: 8px;

  ${({ theme, bgColor }) => `
    background-color: ${bgColor};
    border-radius: ${theme.borderRadius}px;
  `};
`;

export const PercentageText = styled(Text).attrs(({ theme }) => ({
  h2: true,
  weight: 600,
  color: theme.colors.white
}))`
  text-align: center;
`;

export const SubPercentageView = styled(View)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

export const PayoutTypeText = styled(Text).attrs(() => ({
  h5: true,
  weight: 600
}))`
  position: relative;
  margin-top: 2px;
  height: 30px;
  flex-direction: row;
  color: ${({ theme }) => theme.colors.white};

  display: flex;
  align-items: center;
  text-align: center;
  justify-content: center;
`;

export const BtcLogo = styled(BitcoinIcon)`
  margin-right: 6px;
`;

export const FiatIcon = styled(Icon)`
  margin-right: 6px;
`;

//

export const SliderDetailsText = styled(Text).attrs(({ theme }) => ({
  weight: 600,
  color: theme.colors.white,
  h5: true
}))<{ isTranslucent?: boolean }>`
  flex: 1;
  align-items: flex-start;
  margin-top: 4px;
`;

//

export const SubmitButton = styled(Button)`
  position: absolute;
  bottom: 20px;
`;