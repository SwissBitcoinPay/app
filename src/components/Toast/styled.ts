import styled from "styled-components";
import { ComponentStack, Icon, Text } from "@components";
import { ToastProps } from "react-native-toast-notifications/lib/typescript/toast";

export const ToastContainer = styled(ComponentStack)<Pick<ToastProps, "type">>`
  ${({ theme, type }) => `
    border-radius: ${theme.borderRadius}px;
    margin: ${theme.gridSize / 2.5}px 0px;
    padding: ${theme.gridSize / 1.5}px ${theme.gridSize}px;
    background-color: ${(() => {
      switch (type) {
        case "success":
          return theme.colors.success;
        case "info":
          return theme.colors.warning;
        case "error":
          return theme.colors.error;
      }
    })()};
      `}
`;

export const ToastText = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 600,
  color: theme.colors.white
}))``;

export const ToastIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.white};
`;
