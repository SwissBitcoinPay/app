import styled from "styled-components";
import { Text } from "@components";

export const FieldDescription = styled(Text).attrs<{ color?: string }>(
  ({ theme, color }) => ({
    h5: true,
    weight: 600,
    color: color || theme.colors.secondary
  })
)``;
