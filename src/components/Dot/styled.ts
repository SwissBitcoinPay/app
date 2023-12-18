import styled from "styled-components";
import { View } from "@components";

const DOT_SIZE = 16;

export const DotContainer = styled(View)<{ enabled?: boolean }>`
  width: ${DOT_SIZE}px;
  height: ${DOT_SIZE}px;
  border-radius: ${DOT_SIZE / 2}px;

  background-color: ${({ theme, enabled }) =>
    enabled ? theme.colors.success : theme.colors.primaryLight};
`;
