import styled from "styled-components";
import { Text } from "@components";

export const LabelText = styled(Text)`
  ${({ theme, color }) => `
    color: ${color || theme.colors.grey};
  `}
  font-family: Poppins-Medium;
  font-size: 16px;
  z-index: -1;
  position: absolute;
  transform-origin: top left;
`;
