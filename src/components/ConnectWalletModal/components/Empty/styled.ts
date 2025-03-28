import { ComponentStack, Image, Pressable, Text } from "@components";
import styled from "styled-components";

export const SelectHardwareContainer = styled(ComponentStack)`
  max-width: 100%;
`;

export const HardwareContainer = styled(Pressable)`
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
