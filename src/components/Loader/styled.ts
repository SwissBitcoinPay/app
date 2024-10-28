import { Lottie, Text } from "@components";
import styled from "styled-components";

export const LottieLoader = styled(Lottie)<{ size: number }>`
  ${({ size }) => {
    return `
        height: ${size}px;
        width: ${size}px;
        margin: -${size / 3}px;
    `;
  }}
`;

export const LoaderReason = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  margin-top: 12px;
  align-self: center;
`;
