import styled from "styled-components";
import { QRCamera, View, Button, Text, ComponentStack } from "@components";

export const ContainerContent = styled(View)`
  height: 100%;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
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
  overflow: hidden;
  border-radius: 20px;
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
