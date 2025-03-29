import { ComponentStack, Icon, Pressable, Text } from "@components";
import styled from "styled-components";

export const SelectTransportContainer = styled(ComponentStack)`
  max-width: 100%;
`;

export const TransportContainer = styled(Pressable)`
  height: 100px;
  flex: 1;
  width: 200px;
  max-width: 100%;
  border: 2px solid ${({ theme }) => theme.colors.white};
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.3)};
`;

const ICON_SIZE = 40;

export const TransportIcon = styled(Icon).attrs(({ theme }) => ({
  size: ICON_SIZE,
  color: theme.colors.white
}))``;

export const TransportText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.white,
  h4: true,
  weight: 600
}))`
  margin-top: 6px;
`;

export const NotSupportedText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.white,
  h6: true,
  weight: 500
}))`
  text-align: center;
`;
