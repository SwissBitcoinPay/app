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
}))`
  width: 95%;
`;

const NEW_CONTAINER_HEIGHT = 20;

export const AccountNewIcon = styled(Icon).attrs(({ theme }) => ({
  color: theme.colors.white,
  size: NEW_CONTAINER_HEIGHT
}))`
  position: absolute;
  left: 0px;
  top: 0px;
  background-color: ${({ theme }) => theme.colors.success};
`;

export const AccountNewContainerWrapper = styled(View)`
  position: relative;
  flex-direction: row;
  width: 95%;
`;

export const AccountNewContainer = styled(View)`
  position: relative;
  height: ${NEW_CONTAINER_HEIGHT}px;
  padding-left: 4px;
  padding-right: 4px;

  overflow: hidden;
  align-items: center;
  justify-content: center;
  position: relative;
  background-color: ${({ theme }) => theme.colors.successLight};
  border-radius: 4px;
  max-width: 100%;
`;

export const AccountNew = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.primary,
  weight: 500,
  h6: true
}))`
  padding-left: ${NEW_CONTAINER_HEIGHT}px;
  width: 100%;
`;
