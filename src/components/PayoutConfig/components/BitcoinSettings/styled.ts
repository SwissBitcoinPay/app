import styled from "styled-components";
import { View, Text, QR } from "@components";

export const NextAddressesContainer = styled(View)`
  ${({ theme }) => `
    background-color: ${theme.colors.greyLight};
    border-radius: ${theme.gridSize / 3}px;
  `}
  padding: 6px 8px;
`;

export const NextAddress = styled(Text).attrs(() => ({
  h5: true,
  weight: 600
}))`
  color: ${({ theme }) => theme.colors.primary};
`;

export const PassCheckContainer = styled(View)`
  display: flex;
  flex-direction: row;
  align-items: center;
`;

export const PassCheckText = styled(Text)`
  margin-left: 6px;
`;

export const LoaderContainer = styled(View)`
  background-color: ${({ theme }) => theme.colors.warning};
  border-radius: 100px;
  padding: 3px;
`;

export const PayInvoiceText = styled(Text).attrs(() => ({
  h4: true,
  weight: 600
}))`
  text-align: center;
  color: ${({ theme, color }) => color || theme.colors.white};
`;

export const PayInvoiceQr = styled(QR)`
  padding: 16px;
  width: 50%;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.white};
`;
