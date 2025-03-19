import styled from "styled-components";
import { View } from "@components";

export const BackgroundLoading = styled(View)<{
  width: number;
  isSuccess: boolean;
}>`
  position: absolute;
  width: ${({ width = 0 }) => width}%;
  border-radius: ${({ theme }) => theme.borderRadius / 2}px;
  background-color: ${({ isSuccess, theme }) =>
    !isSuccess ? "rgba(0, 0, 0, 0.15)" : theme.colors.success};
  transition: 0.15s ease all;
  height: 100%;
`;
