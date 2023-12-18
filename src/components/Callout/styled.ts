import styled from "styled-components";
import { Text, ComponentStack } from "@components";

export const CalloutContainer = styled(ComponentStack)`
  ${({ theme }) => `
    background-color: ${theme.colors.warning};
    padding: ${theme.gridSize / 1.25}px ${theme.gridSize}px;
    border-radius: ${theme.borderRadius}px;
  `}
`;

export const CalloutText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  flex: 1;
`;
