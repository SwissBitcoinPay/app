import styled from "styled-components";
import { View, Text, Lottie, Pressable } from "@components";

export const BlurContainer = styled(View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;

  display: flex;
  align-items: center;
  justify-content: center;
`;

export const LightningAnimation = styled(Lottie)<{ size: number }>`
  position: absolute;
  opacity: 0.05;
  transform: scale(1.5);
  ${({ size }) => `
    height: ${size}px;
    width: ${size}px;
  `}
`;

export const FirstPart = styled(View)`
  display: flex;
  flex: 1;
  width: 100%;

  flex-direction: column;
  justify-content: center;
`;

export const TagLine = styled(Text).attrs(() => ({ h2: true, weight: 700 }))`
  color: ${({ theme }) => theme.colors.white};
  line-height: 34px;
  width: 100%;
  margin-bottom: 25px;
  font-size: 25px;
`;

export const SubTagLine = styled(Text).attrs(() => ({ h2: true, weight: 700 }))`
  color: ${({ theme }) => theme.colors.white};
  font-size: 22px;
  line-height: 32px;
`;

export const SubTagLineContainer = styled(View)`
  display: flex;
  flex-direction: row;
  width: 100%;
`;

export const ConnectText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
  text-align: center;
  margin-bottom: 16px;
  margin-top: -4px;
`;

export const SeparatorLine = styled(View)`
  width: 90%;
  height: 2px;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  margin: 24px 0px;
`;

export const PressableVersion = styled(Pressable)`
  align-self: center;
`;

export const VersionText = styled(Text)`
  margin-top: 18px;
  margin-bottom: 6px;
  color: ${({ theme }) => theme.colors.greyLight};
`;