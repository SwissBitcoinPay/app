import styled from "styled-components";
import {
  FieldDescription,
  ComponentStack as RootComponentStack,
  Text,
  View
} from "@components";

export const CenteredFieldDescription = styled(FieldDescription)`
  text-align: center;
`;

export const WordsContainer = styled(View)`
  ${({ theme }) => `
    border: 2px solid ${theme.colors.bitcoin};
    border-radius: ${theme.borderRadius / 2}px;
  `}
  padding: 10px;
  padding-top: 24px;
  flex-direction: row;
`;

export const WordsColumn = styled(RootComponentStack).attrs(() => ({
  gapSize: 14
}))`
  flex: 1;
`;

export const ConfidentialText = styled(Text).attrs(() => ({
  h6: true,
  weight: 700
}))`
  ${({ theme }) => `
    color: ${theme.colors.white};
    background-color: ${theme.colors.bitcoin};
    padding: 2px 6px;
    border-bottom-left-radius: ${theme.borderRadius / 2}px;
  `}

  position: absolute;
  top: 0px;
  right: 0px;
`;

export const CenteredStackComponent = styled(RootComponentStack)`
  align-items: center;
`;
