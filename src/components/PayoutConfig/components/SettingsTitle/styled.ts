import styled from "styled-components";
import { Icon as RootIcon, ComponentStack } from "@components";

const HORIZONTAL_PADDING = 12;

export const TitleStack = styled(ComponentStack)<{ isValid: boolean }>`
  padding: 10px ${HORIZONTAL_PADDING}px;
  align-items: center;
  justify-content: center;
  ${({ theme, isValid }) => `
    border: 2px solid ${theme.colors.grey};
    ${
      isValid
        ? `
        background-color: ${theme.colors.success};
        border-color: transparent;
    `
        : ``
    }
    border-radius: ${theme.borderRadius}px;
  `}
`;

export const Icon = styled(RootIcon)`
  position: absolute;
  right: ${HORIZONTAL_PADDING}px;
  align-self: center;
`;
