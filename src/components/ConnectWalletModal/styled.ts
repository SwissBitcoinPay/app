import styled from "styled-components";
import { Text, ComponentStack as RootComponentStack, Icon } from "@components";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

export const Title = styled(Text).attrs(() => ({
  h4: true,
  weight: 600
}))`
  ${({ theme }) => `
    color: ${theme.colors.white};
    background-color: ${theme.colors.bitcoin};
    border-radius: ${theme.borderRadius}px;
    margin-bottom: ${theme.gridSize / 2}px;
  `}

  align-self: center;
  padding: 8px 12px;
`;

export const ComponentStack = styled(RootComponentStack)`
  align-items: center;
`;

export const CheckIcon = styled(Icon).attrs(({ theme }) => ({
  icon: faCheck,
  color: theme.colors.secondary,
  size: 20
}))`
  transform: translateY(4px);
`;