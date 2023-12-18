import { Text, View } from "@components";
import styled from "styled-components";

export const FooterLineContainer = styled(View)`
  flex-direction: row;
  width: 100%;
  justify-content: space-between;
  align-items: center;
`;

export const FooterLabel = styled(Text).attrs(({ theme }) => ({
  h5: true,
  weight: 600,
  color: theme.colors.white
}))`
  flex: 1;
  text-align-vertical: center;
  color: ${({ theme }) => theme.colors.white};
`;

export const FooterValue = styled(Text).attrs(() => ({
  h5: true,
  weight: 600
}))`
  display: flex;
  flex-direction: row;
  align-items: center;
  text-decoration: none;
  height: 22px;
  justify-content: center;
  text-align-vertical: center;
`;
