import styled from "styled-components";
import { View } from "@components";

export const BackgroundEffectContainer = styled(View)<{ x: number; y: number }>`
  ${({ theme, x, y }) => `
    left: ${x}px;
    top: ${y}px;
    background-color: ${theme.colors.secondaryLight};
  `}
  position: absolute;
  width: 1px;
  height: 1px;
  border-radius: 1000px;
  z-index: -1;
`;
