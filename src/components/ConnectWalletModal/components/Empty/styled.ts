import {
  ComponentStack,
  Image,
  Link,
  Pressable,
  Text,
  View
} from "@components";
import styled from "styled-components";

export const SelectHardwareContainer = styled(ComponentStack)`
  max-width: 100%;
  align-items: center;
`;

export const HardwareContainerWrapper = styled(View)`
  width: 200px;
  max-width: 100%;
  flex-shrink: 1;
  align-items: center;
`;

export const BuyHardwareText = styled(Text).attrs(() => ({
  h6: true,
  weight: 600
}))``;

export const HardwareContainer = styled(Pressable)`
  height: 80px;
  width: 100%;
  border: 2px solid ${({ theme }) => theme.colors.white};
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.3)};
  margin-bottom: 3px;
`;

export const HardwareImage = styled(Image)`
  height: 45px;
`;

export const NotSupportedText = styled(Text).attrs(({ theme }) => ({
  color: theme.colors.white,
  h6: true,
  weight: 500
}))`
  margin-top: 4px;
  text-align: center;
`;
