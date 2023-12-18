import styled from "styled-components";
import { Text } from "@components";

export const StepTitle = styled(Text).attrs(() => ({
  h3: true,
  weight: 600
}))`
  ${({ theme }) => `
    color: ${theme.colors.warning};
    border: 3px solid ${theme.colors.warning};
    border-radius: ${theme.borderRadius}px;
    margin-bottom: ${theme.gridSize / 2}px;
  `}

  align-self: center;
  padding: 8px 12px;
`;
