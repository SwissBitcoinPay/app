import styled from "styled-components";
import {
  Text,
  PageContainer,
  ComponentStack,
  View,
  TextField
} from "@components";

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

export const SignatureLoginComponentStack = styled(ComponentStack)`
  ${({ theme }) => `
    background-color: ${theme.colors.flashWhite};
    border: 3px solid ${theme.colors.primaryLight};
    border-radius: ${theme.borderRadius}px;
  `}

  padding: 16px;
`;

const KEY_SIZE = 34;

export const IndexContainer = styled(View)<{ enabled: boolean }>`
  ${({ theme, enabled }) => `
    background-color: ${
      enabled ? theme.colors.bitcoin : theme.colors.secondaryLight
    };
    color: ${enabled ? theme.colors.white : theme.colors.secondary};
  `}

  align-items: center;
  justify-content: center;

  width: ${KEY_SIZE}px;
  height: ${KEY_SIZE}px;
  border-radius: ${KEY_SIZE / 2}px;
  padding: 4px 6px;
`;

export const IndexText = styled(Text).attrs(({ theme }) => ({
  weight: 600,
  color: theme.colors.white
}))`
  text-align: center;
`;


export const WordTextField = styled(TextField)`
  flex: 1;
`;