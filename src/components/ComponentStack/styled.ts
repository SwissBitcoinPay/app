import styled from "styled-components";
import { View } from "@components";

type ComponentStackStyleProps = {
  direction: "vertical" | "horizontal";
};

export const ComponentStack = styled(View)<
  ComponentStackStyleProps & { fullWidth?: number }
>`
  ${({ theme, direction, fullWidth }) => `
        flex-direction: ${direction === "vertical" ? "column" : "row"};
        ${direction === "horizontal" ? "align-items: center;" : "width: 100%;"}
        ${
          fullWidth
            ? `width: ${fullWidth}px; margin-left: -${theme.gridSize}px;`
            : ""
        }
    `}
`;

export const GapView = styled(View)<
  ComponentStackStyleProps & { gapSize?: number; gapColor?: string }
>`
  z-index: -1;
  ${({ theme, direction, gapSize, gapColor = "transparent" }) => `
        ${direction === "vertical" ? "height" : "width"}: ${
          gapSize !== undefined ? gapSize : theme.gridSize
        }px;
        ${direction === "horizontal" ? "height" : "width"}: 100%;
        background-color: ${gapColor};
    `}
`;
