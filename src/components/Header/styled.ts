import styled from "styled-components";
import { View, Text, Icon, Pressable } from "@components";

export const Header = styled(View)<{
  topInset?: number;
  isLargeScreen?: boolean;
}>`
  ${({ topInset = 0, isLargeScreen }) => {
    return `
      padding-top: ${topInset}px;
      ${isLargeScreen ? "border-radius: 16px;" : ""}
    `;
  }}

  overflow: hidden;
  align-items: center;
  justify-content: space-between;
  display: flex;
  flex-direction: row;
  width: 100%;
`;

const BUTTON_SIZE = 72;

export const HeaderButton = styled(Pressable)<{ isWide?: boolean }>`
  height: ${BUTTON_SIZE}px;
  width: ${BUTTON_SIZE}px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const HeaderIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.white};
`;

export const HeaderTitleContainer = styled(View)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const HeaderTitle = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  position: relative;
  text-align: center;
`;

export const SubTitleContainer = styled(Pressable)`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: -3px;
`;

export const SubTitleText = styled(Text)`
  position: relative;
  top: 1px;
  margin-left: 4px;

  font-size: 12px;
`;

