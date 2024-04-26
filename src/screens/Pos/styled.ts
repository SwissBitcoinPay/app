import styled from "styled-components";
import {
  View,
  Icon,
  Loader,
  TextInput,
  Button,
  ComponentStack,
  Picker
} from "@components";

export const InfosContainer = styled(View)`
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 32px;
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
  background-color: green;
  z-index: 1;
`;

export const FiatAmountDropdownIcon = styled(Icon).attrs(() => ({
  size: fiatAmountDropdownIconSize
}))``;

export const FiatUnitPicker = styled(Picker)`
  position: absolute;
  background-color: red;
  height: 100%;
  width: 100%;
  opacity: 1;
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

export const DescriptionContainer = styled(View)`
  margin-top: 32px;
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
