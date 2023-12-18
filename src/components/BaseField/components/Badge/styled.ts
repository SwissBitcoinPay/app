import { Icon, View } from "@components";
import styled from "styled-components";

export const BadgeContainer = styled(View)`
  height: 100%;
  padding: 0px 12px;
  align-items: center;
  justify-content: center;
`;

export const BadgeIcon = styled(Icon)`
  ${({ theme }) => `
    background-color: ${theme.colors.white};
  `}
`;
