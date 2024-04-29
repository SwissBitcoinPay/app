import styled from "styled-components";
import { QRCamera, View, Button, Text, ComponentStack } from "@components";
import { Platform } from "react-native";

const WINDOW_SIZE = 300;
const BORDER_SIZE = 4;

export const WindowContainer = styled(View)`
  height: ${WINDOW_SIZE}px;
  width: ${WINDOW_SIZE}px;
  position: absolute;
  overflow: hidden;

  bottom: 110%;
  border-radius: 20px;
  right: 16px;
  border: ${BORDER_SIZE}px solid white;
  ${Platform.OS === "android" ? "opacity: 0;" : ""}
`;

export const VerticialPart = styled(View)<{ isItemsBottom?: boolean }>`
  width: 100%;
  flex-direction: row;
  justify-content: center;
  align-items: ${({ isItemsBottom }) =>
    isItemsBottom ? "flex-end" : "center"};
`;

export const TitleText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  background-color: ${({ theme }) => theme.colors.bitcoin};
  padding: 4px 12px;
  border-radius: 100px;
`;

export const BottomButtons = styled(ComponentStack)`
  justify-content: center;
`;

export const Camera = styled(QRCamera)`
  position: relative;
  height: ${WINDOW_SIZE}px;
  width: ${WINDOW_SIZE - BORDER_SIZE * 2}px;
  overflow: hidden;
`;

const CLOSE_BUTTON_PADDING = 12;

export const CloseButton = styled(Button)`
  position: absolute;
  top: ${CLOSE_BUTTON_PADDING}px;
  right: ${CLOSE_BUTTON_PADDING}px;
`;
