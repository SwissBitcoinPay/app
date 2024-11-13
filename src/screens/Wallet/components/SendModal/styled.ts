import styled from "styled-components";
import { ComponentStack, FieldDescription, Pressable, Text } from "@components";

export const AmountDescription = styled(FieldDescription)``;

export const BelowAmountContainer = styled(ComponentStack)`
  justify-content: space-between;
`;

export const FeesOptionContainer = styled(Pressable)<{
  isMedium: boolean;
  isFirst: boolean;
  isLast: boolean;
  isEnabled: boolean;
}>`
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-vertical: 8px;
  flex: 1;
  ${({ theme, isFirst, isLast, isEnabled }) => `
    background-color: ${
      isEnabled ? theme.colors.bitcoin : theme.colors.primaryLight
    };
    ${
      isFirst
        ? ["top-left", "bottom-left"].reduce(
            (result, v) =>
              `${result} border-${v}-radius: ${theme.borderRadius / 1.5}px;`,
            ""
          )
        : ""
    }
    ${
      isLast
        ? ["top-right", "bottom-right"].reduce(
            (result, v) =>
              `${result} border-${v}-radius: ${theme.borderRadius / 1.5}px;`,
            ""
          )
        : ""
    }
  `}
`;

export const FeesLabelText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.white
}))``;

export const FeesValueText = styled(Text).attrs<{ isEnabled: boolean }>(
  ({ theme, isEnabled }) => ({
    color: isEnabled ? theme.colors.white : theme.colors.secondary
  })
)`
  margin-top: 1px;
`;
