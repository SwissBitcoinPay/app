import styled from "styled-components";
import { Text } from "@components";

export const FieldDescription = styled(Text).attrs<{
  color?: string;
  isHighlighted?: boolean;
}>(({ theme, color, isHighlighted }) => ({
  h5: true,
  weight: 600,
  color: isHighlighted ? theme.colors.bitcoin : color || theme.colors.secondary
}))``;
