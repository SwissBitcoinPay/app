import styled from "styled-components";
import { Pressable, BaseField as RootBaseField, Text } from "@components";

export const BaseField = styled(RootBaseField)`
  background-color: transparent;
  border-width: 0px;
  align-items: center;
`;

export const PressableContainer = styled(Pressable)`
  margin: ${({ theme }) => theme.gridSize / 2}px 0px;
  flex-direction: row;
  align-self: flex-start;
`;

export const LabelText = styled(Text)`
  ${({ theme }) => `
    color: ${theme.colors.white};
    margin-left: ${theme.gridSize / 2}px;
  `}
`;
