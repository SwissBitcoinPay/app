import styled from "styled-components";
import {
  View,
  Icon,
  Loader,
  TextInput,
  Text,
  Button,
  ComponentStack,
  Picker
} from "@components";
import { animated } from "@react-spring/native";

export const PLUS_TEXTS_SCALE = 0.43745;
export const PLUS_TEXTS_TRANSLATE_Y = 51;

const _AnimatedText = animated(Text);
const AnimatedView = animated(View);

export const InfosContainer = styled(View)<{
  isSmallHeight?: boolean;
}>`
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: ${({ isSmallHeight }) => (!isSmallHeight ? 32 : 0)}px;
`;

export const ATMButton = styled(Button)`
  position: absolute;
  top: -16px;
  background-color: ${({ theme }) => theme.colors.grey};
`;

const fiatAmountDropdownIconSize = 18;

export const FiatAmountComponentStack = styled(ComponentStack)`
  margin-left: ${({ theme }) =>
    fiatAmountDropdownIconSize + theme.gridSize / 2}px;

  overflow: hidden;
  z-index: 1;
`;

export const FiatAmountDropdownIcon = styled(Icon).attrs(() => ({
  size: fiatAmountDropdownIconSize
}))``;

export const FiatUnitPicker = styled(Picker)`
  position: absolute;
  height: 100%;
  width: 100%;
  opacity: 0;
  z-index: 100;
`;

export const PadContainer = styled(View)`
  display: flex;
  flex-direction: column;
  width: 100%;
  z-index: -1;
`;

export const PadLine = styled(View)`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

export const DescriptionContainer = styled(View)<{
  isSmallHeight?: boolean;
}>`
  margin-top: ${({ isSmallHeight }) => {
    return !isSmallHeight ? 48 : 10;
  }}px;
  border-bottom-color: ${({ theme }) => theme.colors.primaryLight};
  border-bottom-width: 2px;
  width: 70%;
  display: flex;
  flex-direction: row;
  align-items: center;
`;

export const DescriptionInput = styled(TextInput)`
  text-align: center;
  color: ${({ theme }) => theme.colors.white};
  background: transparent;
  font-size: 18px;
  display: flex;
  font-family: Poppins-Bold;
  padding: 0px 38px;
  height: 52px;
  width: 100%;
  align-items: center;
  justify-content: center;
`;

export const DescriptionIcon = styled(Icon)`
  position: absolute;
  left: 12px;
  color: ${({ theme }) => theme.colors.primaryLight};
  z-index: -1;
`;

export const BackgroundLoader = styled(Loader)`
  position: absolute;
  opacity: 0.5;
  top: 8px;
  right: 8px;
`;

export const AmountsContainer = styled(View)`
  flex-direction: row;
  justify-content: center;
`;

export const PlusTextsContainer = styled(AnimatedView)<{
  isTop?: boolean;
  isBottom?: boolean;
}>`
  position: absolute;
  flex-direction: row;

  ${({ isTop, isBottom }) =>
    isTop || isBottom
      ? `transform: scale(${PLUS_TEXTS_SCALE})
          translateY(${PLUS_TEXTS_TRANSLATE_Y * (isTop ? -1 : 1)}px);`
      : ""}
`;

export const AnimatedText = styled(_AnimatedText).attrs(({ theme }) => ({
  h2: true,
  weight: 700
}))`
  color: ${({ theme }) => theme.colors.white};
`;

export const PlusText = styled(AnimatedText)`
  color: ${({ theme }) => theme.colors.greyLight};
`;

export const SymbolText = styled(PlusText)<{ isBottom?: boolean }>`
  position: absolute;
  transform: scale(${PLUS_TEXTS_SCALE})
    translateY(${({ isBottom }) => 28 * (isBottom ? 1 : -1)}px);
`;
