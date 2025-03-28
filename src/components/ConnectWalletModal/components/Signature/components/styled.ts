import { Icon, Text, View } from "@components";
import styled from "styled-components";

export const AccountBalanceContainer = styled(View)`
  flex-direction: row;
  align-items: center;
`;

export const AccountBalance = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.greyLight,
  weight: 500,
  h5: true
}))``;

export const AccountNewIcon = styled(Icon).attrs(({ theme }) => ({
  color: theme.colors.white,
  size: 14
}))`
  position: absolute;
  left: 0px;
  top: 0px;
  height: 100%;
  padding-left: 6px;
  padding-right: 6px;

  background-color: ${({ theme }) => theme.colors.success};
`;

export const AccountNew = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.primary,
  weight: 500,
  h6: true
}))`
  overflow: hidden;
  position: relative;
  padding: 3px 6px;
  padding-left: 32px;
  background-color: ${({ theme }) => theme.colors.successLight};
  border-radius: 4px;
`;
