import styled from "styled-components";
import { ComponentStack, Text } from "@components";
import { ListItem } from "@components/ItemsList/components/ListItem";

export const CashedListItem = styled(ListItem)`
  ${({ theme }) =>
    `
      background-color: ${theme.colors.bitcoin};
      border-radius: ${theme.borderRadius}px;
    `}

  margin-left: 8px;
  margin-right: 8px;

  padding-left: 12px;
  padding-right: 12px;
`;

export const SwitchContainerStack = styled(ComponentStack)`
  position: relative;
  align-self: center;
`;

export const SwitchLabel = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 600,
  color: theme.colors.white,
  numberOfLines: 1
}))<{ isRight?: boolean }>`
  position: absolute;

  min-width: 300px;
  ${({ isRight }) => (isRight ? "left" : "right")}: 64px;
  text-align: ${({ isRight }) => (isRight ? "left" : "right")};
`;
