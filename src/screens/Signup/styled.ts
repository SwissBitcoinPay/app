import styled from "styled-components";
import { Text, View } from "@components";

export const TermsText = styled(Text).attrs<{ color?: string }>(
  ({ theme, color }) => ({
    h4: true,
    weight: 600,
    color: color || theme.colors.grey
  })
)`
  text-align: center;
`;

export const ValidRefCodeContainer = styled(View)`
  ${({ theme }) => `
    background-color: ${theme.colors.bitcoin};
    margin-top: -${theme.gridSize}px;
    padding-top: ${theme.gridSize}px;
    padding-bottom: ${theme.gridSize / 2}px;
    border-bottom-left-radius: ${theme.borderRadius}px;
    border-bottom-right-radius: ${theme.borderRadius}px;
    align-items: center;
  `}
`;

export const ValidRefCode = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.white,
  weight: 600,
  h4: true
}))``;
