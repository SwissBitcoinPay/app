import styled from "styled-components";
import { View, Text, Icon, Loader, TextInput } from "@components";

export const InfosContainer = styled(View)`
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 32px;
`;

export const ATMContainer = styled(View)`
  position: absolute;
  top: 2px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
  background-color: #747d8c;
  border-radius: 100px;
  padding: 0px 10px;
`;

export const ATMIcon = styled(Icon)``;
export const ATMText = styled(Text)`
  margin-left: 6px;
  margin-top: 3px;
  font-size: 11px;
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
