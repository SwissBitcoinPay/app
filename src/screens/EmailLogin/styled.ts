import styled from "styled-components";
import { Text, PageContainer } from "@components";

export const StyledPageContainer = styled(PageContainer).attrs(() => ({
  contentContainerStyle: {
    justifyContent: "center"
  }
}))``;

export const ForgotPasswordText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.primary,
  weight: 600,
  h4: true
}))`
  display: flex;
  justify-content: flex-end;
  text-align: right;
`;
