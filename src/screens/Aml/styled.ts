import styled from "styled-components";
import { Text, ComponentStack, View, Icon } from "@components";

export const StyledComponentStack = styled(ComponentStack)`
  align-items: center;
`;

export const InvoicePreviewContainer = styled(ComponentStack)`
  border: 3px solid ${({ theme }) => theme.colors.bitcoin};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  padding: ${({ theme }) => theme.gridSize / 2}px;
  width: 100%;
  max-width: 440px;
`;

export const DescriptionLine = styled(View)`
  justify-content: space-between;
  flex-direction: row;
`;

export const LabelContainer = styled(ComponentStack).attrs(() => ({
  direction: "horizontal",
  gapSize: 8
}))``;

export const LabelIcon = styled(Icon).attrs(({ theme }) => ({
  color: theme.colors.white,
  size: 16
}))``;

export const Label = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 600,
  color: theme.colors.white
}))``;

export const Value = styled(Label).attrs(({ theme }) => ({
  color: theme.colors.bitcoin
}))``;

export const PartTitle = styled(Text).attrs(({ theme, color }) => ({
  h3: true,
  weight: 700,
  color: color || theme.colors.white
}))``;

export const PartDescription = styled(Text).attrs(({ theme, color }) => ({
  h4: true,
  weight: 600,
  color: color || theme.colors.white
}))`
  text-align: center;
`;

// Submitted
export const SubmittedIcon = styled(Icon).attrs(({ theme }) => ({
  color: theme.colors.greyLight
}))`
  margin-top: 42px;
`;

export const SubmittedTitle = styled(Text).attrs(({ theme }) => ({
  h3: true,
  weight: 700,
  color: theme.colors.greyLight
}))``;

export const SubmittedDescription = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 700,
  color: theme.colors.greyLight
}))`
  margin-top: 8px;
  text-align: center;
`;
