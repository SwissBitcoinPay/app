import { TextInput as RootTextInput } from "react-native";
import styled from "styled-components";
import { ComponentStack, Pressable, View } from "@components";
import { FIELD_BORDER_WIDTH } from "@components/BaseField/styled";

export const TextFieldContainer = styled(View)`
  position: relative;
  z-index: 1;
`;

export const TextInput = styled(RootTextInput)<{
  hasRightBadge?: boolean;
  isLabelAsPlaceholder?: boolean;
}>`
  flex: 1;
  padding: 0px 12px;
  ${({ theme, hasRightBadge, multiline, isLabelAsPlaceholder }) =>
    `
      color: ${theme.colors.primary};
      ${hasRightBadge ? "padding-right: 0px;" : ""}
      padding-top: ${!isLabelAsPlaceholder ? (multiline ? 14 : 8) : multiline ? 6 : 0}px;
      ${multiline ? `padding-bottom: 4px;` : ``}
    `}
  width: 100%;
  align-items: flex-start;
  justify-content: flex-start;
  font-size: 16px;
  font-family: Poppins-Medium;
  background-color: transparent;
  z-index: 1;
`;

export const SuggestionsComponentStack = styled(ComponentStack)<{
  isHidden: boolean;
}>`
  ${({ theme }) => `
    background-color: ${theme.colors.white};
    border-radius: ${theme.borderRadius}px;
    border: ${FIELD_BORDER_WIDTH}px solid ${theme.colors.primaryLight};
    border-top-color: ${theme.colors.primaryLight};
    `}
  border-top-width: 2px;
  border-top-left-radius: 0px;
  border-top-right-radius: 0px;

  ${({ isHidden }) => (isHidden ? "display: none;" : "")}

  position: absolute;
  top: 100%;
  width: 100%;
  right: 0px;
  margin-top: -10px;
  overflow: hidden;
`;

export const SuggestionItem = styled(Pressable)<{ isHighlighted?: boolean }>`
  padding: 8px 12px;
  ${({ theme, isHighlighted }) =>
    isHighlighted ? `background-color: ${theme.colors.secondaryLight};` : ""}
`;
