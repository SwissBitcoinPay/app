import styled from "styled-components";
import { Button, Header, View } from "@components";
import { platform } from "@config";
import { StyleSheet, ScrollView } from "react-native";

const { maxContentWidth, isWeb } = platform;

const PAGE_PADDING_VERTICAL = 24;

type AttrsProps = {
  isLarge?: boolean;
  isStrictTopMargin?: boolean;
  noBottomMargin?: boolean;
  noPadding?: boolean;
  noVerticalPadding?: boolean;
  noHorizontalPadding?: boolean;
  headerHeight: number;
  bottomHeight: number;
};

export const StyledPageContainer = styled(ScrollView).attrs<AttrsProps>(
  ({
    theme,
    isLarge,
    isStrictTopMargin,
    noBottomMargin,
    noPadding,
    noVerticalPadding,
    noHorizontalPadding,
    headerHeight,
    bottomHeight,
    contentContainerStyle
  }) => ({
    contentContainerStyle: {
      position: "relative",
      alignItems: "center",
      justifyContent: "flex-start",
      flexGrow: 1,
      paddingVertical:
        !isStrictTopMargin && ((!noVerticalPadding && !noPadding) || isLarge)
          ? PAGE_PADDING_VERTICAL
          : 0,
      paddingHorizontal:
        !isLarge && !noHorizontalPadding && !noPadding ? theme.gridSize : 0,
      [isStrictTopMargin ? "marginTop" : "paddingTop"]:
        headerHeight + (isLarge ? 2 : 1) * PAGE_PADDING_VERTICAL,
      marginBottom: !noBottomMargin && bottomHeight,
      ...StyleSheet.flatten(contentContainerStyle)
    }
  })
)<
  AttrsProps & {
    windowWidth: number;
  }
>`
  width: 100%;
  display: flex;
  flex-direction: column;

  ${({ isLarge, windowWidth }) =>
    isLarge ? `padding: 0px ${(windowWidth - maxContentWidth) / 2}px;` : ``};

  ${isWeb
    ? `
      -ms-overflow-style: none;
      scrollbar-width: none;
      
      &::-webkit-scrollbar {
        display: none;
      }
    `
    : ""}
`;

export const PageHeader = styled(Header)<{
  isVisible?: boolean;
  isLarge?: boolean;
}>`
  ${({ isVisible }) => (!isVisible ? "width: 0px;" : "")}

  position: absolute;
  top: 0px;

  ${({ isLarge }) =>
    isLarge
      ? `
          margin-top: ${PAGE_PADDING_VERTICAL}px;
          max-width: ${maxContentWidth}px;
        `
      : ""}
`;

export const PageFooterGap = styled(View)`
  height: 80px;
`;

export const PageFooterButton = styled(Button)<{
  isLarge?: boolean;
  windowWidth: number;
  bottomHeight: number;
}>`
  position: absolute;

  ${({ theme, isLarge, windowWidth, bottomHeight }) => `
    bottom: ${theme.gridSize + bottomHeight}px;
    width: ${isLarge ? maxContentWidth : windowWidth - theme.gridSize * 2}px;
  `}
`;
