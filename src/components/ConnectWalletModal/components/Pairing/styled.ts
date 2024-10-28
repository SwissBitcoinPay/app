import styled from "styled-components";
import { FieldDescription, View } from "@components";

export const HashContainer = styled(View)`
  ${({ theme }) => `
    border: 3px solid ${theme.colors.warning};
    border-radius: ${theme.borderRadius}px;
  `}

  align-self: center;
  padding: 8px 12px;
`;

export const Hash = styled(FieldDescription).attrs(({ theme }) => ({
  color: theme.colors.bitcoin
}))``;
