import { Text, View } from "@components";
import styled from "styled-components";

export const AccountBalanceContainer = styled(View)`
  flex-direction: row;
  align-items: center;
`;

export const AccountBalance = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.grey,
  weight: 500,
  h5: true
}))``;
