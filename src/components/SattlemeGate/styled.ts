import styled from "styled-components";
import { ScrollView } from "react-native";
import { View } from "@components";

// Comme les pages de connexion (`PageContainer`, centré), sans en-tête.
export const Page = styled(ScrollView)`
  width: 100%;
`;

export const pageContent = {
  flexGrow: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: 16
} as const;

export const PageContent = styled(View)`
  width: 100%;
  max-width: 480px;
`;

export const WordsGrid = styled(View)`
  ${({ theme }) => `
    border: 2px solid ${theme.colors.bitcoin};
    border-radius: ${theme.borderRadius / 2}px;
  `}
  flex-direction: row;
  flex-wrap: wrap;
  padding: 8px;
`;

export const WordCell = styled(View)`
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  width: 50%;
  padding: 6px;
`;
