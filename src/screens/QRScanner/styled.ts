import styled from "styled-components";
import { QRCamera } from "@components";
import { View, Button, Text } from "@components";

export const ContainerContent = styled(View)`
  height: 100%;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
`;

export const VerticialPart = styled(View)<{ isItemsBottom?: boolean }>`
  ${({ isItemsBottom }) => (isItemsBottom ? "bottom: 24px;" : "")}
  position: absolute;
  width: 100%;
  align-items: center;
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

export const BottomButtons = styled(View)`
  display: flex;
  flex-direction: row;
  align-items: center;
  z-index: 10000;
`;

export const Camera = styled(QRCamera)`
  position: absolute;
`;

export const BottomButton = styled(Button)<{ position?: "left" | "right" }>`
  ${({ position }) => {
    if (!position) return "";

    const distance = 74 + 18;

    return `
        position: absolute;
        ${position === "left" ? "right" : "left"}: ${distance}px;
    `;
  }}
`;
