import styled from "styled-components";
import { Text, ComponentStack, Button } from "@components";

export const SourceOfFundContainer = styled(ComponentStack)`
  position: relative;
  padding: 16px;
  border: 4px solid ${({ theme }) => theme.colors.grey};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  align-items: center;
`;

export const SourceOfFundDeleteButton = styled(Button)`
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
`;

export const SourceOfFundPart = styled(ComponentStack)`
  align-items: center;
`;

export const PartTitle = styled(Text).attrs(({ theme, color }) => ({
  h3: true,
  weight: 700,
  color: color || theme.colors.white
}))``;
