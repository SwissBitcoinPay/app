import styled from "styled-components";
import { Button, ComponentStack, View } from "@components";

export const LoginViewComponentStack = styled(View)`
  ${({ theme }) => `
    background-color: ${theme.colors.flashWhite};
    border-radius: ${theme.borderRadius * 2}px;
  `}

  overflow: hidden;
  width: 100%;
`;

export const ContentContainer = styled(ComponentStack)`
  ${({ theme }) => `
    padding: ${theme.gridSize}px ${theme.gridSize * 1.25}px;
  `}
`;

export const LoginViewButton = styled(Button)`
  border-top-left-radius: 0px;
  border-top-right-radius: 0px;
`;
