import styled from "styled-components";
import { View, Text, Pressable } from "@components";

export const NumberContainer = styled(View)<{
  noExpend?: boolean;
  customColor?: string;
  disabled?: boolean;
  noBorderRadius?: boolean;
  rounded?: "left" | "right";
  bottomPadding?: number;
  isLargeScreen?: boolean;
}>`
  margin: 4px;
  border-radius: 16px;

  ${({
    noExpend,
    bottomPadding = 0,
    noBorderRadius,
    customColor,
    disabled,
    rounded,
    isLargeScreen
  }) => {
    return `
      ${noExpend ? "width: 33.333%;" : "flex: 1;"}
      height: ${24 + (bottomPadding > 24 ? bottomPadding : 24) * 2}px;
      ${noBorderRadius ? "border-radius: 0px; margin: 0px;" : ""}
      ${customColor ? `background: ${customColor};` : ""}
      ${disabled ? `opacity: 0.75;` : ""}

      ${
        rounded
          ? `
              border-top-${rounded}-radius: 16px;
              ${isLargeScreen ? `border-bottom-${rounded}-radius: 16px;` : ""}
            `
          : ""
      }
    `;
  }}

  display: flex;
  overflow: hidden;
`;

export const NumberInputContainer = styled(Pressable)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
`;

export const NumberInputText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  line-height: 44px;
`;
