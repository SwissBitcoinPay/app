import styled from "styled-components";
import { Text, ComponentStack, QR } from "@components";

export const BalanceComponentStack = styled(ComponentStack)`
  align-items: center;
`;

export const BalanceTitle = styled(Text)`
  color: ${({ theme }) => theme.colors.greyLight};
`;

export const Balance = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
`;

export const ActionButtonsContainer = styled(ComponentStack)`
  width: 100%;
`;

export const ReceiveQR = styled(QR)`
  padding: ${({ theme }) => theme.gridSize / 1.5}px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;
