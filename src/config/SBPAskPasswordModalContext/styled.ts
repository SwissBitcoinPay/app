import { Text } from "@components";
import styled from "styled-components";

export const ForgotPasswordText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.primary,
  weight: 600,
  h4: true
}))`
  display: flex;
  justify-content: flex-end;
  text-align: right;
`;
