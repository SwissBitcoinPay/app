import styled from "styled-components";
import { Text, View } from "@components";

const KEY_SIZE = 34;

export const IndexContainer = styled(View)`
  ${({ theme }) => `
    background-color: ${theme.colors.bitcoin};
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
