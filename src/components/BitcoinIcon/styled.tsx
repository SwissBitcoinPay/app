import styled from "styled-components";
import { Icon, View } from "@components";

export const BitcoinIconContainer = styled(View)<{
  size: number;
}>`
  position: relative;
  ${({ size }) => `width: ${size}px; height: ${size}px;`}
`;

export const BitcoinIconBackground = styled(View)<{
  backgroundColor?: string;
}>`
  position: absolute;
  background-color: ${({ theme, backgroundColor }) =>
    backgroundColor || theme.colors.white};
  width: 80%;
  height: 80%;
  border-radius: 2100px;
  top: 10%;
  left: 10%;
  z-index: -1;
`;

export const BitcoinIcon = styled(Icon)`
  color: ${({ theme }) => theme.colors.bitcoin};
`;
