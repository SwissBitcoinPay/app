import styled from "styled-components";
import { Button, Icon, Text, View } from "@components";

export const ModalBackground = styled(View)`
  height: 100%;
  width: 100%;
  background: rgba(0, 0, 0, 0.6);
  align-items: center;
  justify-content: center;
`;

export const ModalContent = styled(View)<{ isScreenExtraLarge?: boolean }>`
  padding: 18px 16px;
  max-height: 85%;

  ${({ theme, isScreenExtraLarge }) => `
    background-color: ${theme.colors.primary};
    border-radius: ${theme.borderRadius}px;
    width: ${isScreenExtraLarge ? "30%" : "90%"};
    border: 4px solid ${theme.colors.primaryLight};
  `}
`;
export const ModalHeader = styled(View)`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

export const HeaderText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
`;

export const HeaderIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.primary};
`;

export const SubmitButton = styled(Button)`
  margin-top: 24px;
  z-index: -1;
`;
