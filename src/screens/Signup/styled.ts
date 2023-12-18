import styled from "styled-components";
import { Text } from "@components";

export const TermsText = styled(Text).attrs<{ color?: string }>(
  ({ theme, color }) => ({
    h4: true,
    weight: 600,
    color: color || theme.colors.grey
  })
)`
  text-align: center;
`;
