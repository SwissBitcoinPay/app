import styled from "styled-components";
import {
  ComponentStack,
  Text,
  View,
  QR as RootQR,
  Pressable
} from "@components";

export const FlexComponentStack = styled(ComponentStack)`
  flex-grow: 1;
`;

export const EditableLine = styled(View)`
  padding: 0px 12px;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  align-items: flex-end;
  height: 80px;
  align-items: center;
`;

export const EditText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
`;

export const ConnectedAsContainer = styled(View)`
  align-items: center;
`;

export const ConnectedAsText = styled(Text)`
  color: ${({ theme }) => theme.colors.white};
`;

export const ConnectedAsContainerLine = styled(ComponentStack)`
  margin-top: 2px;
  background-color: ${({ theme }) => theme.colors.white};
  border-radius: 100px;
  padding: 2px 8px;
`;

export const UserTypeText = styled(Text)`
  align-self: flex-end;
  color: ${({ theme }) => theme.colors.primary};
`;

export const QRPressable = styled(Pressable)`
  align-self: center;
`;

export const QR = styled(RootQR)`
  border-radius: ${({ theme }) => theme.borderRadius / 1.5}px;
  padding: ${({ theme }) => theme.gridSize / 1.5}px;
`;

export const PressableVersion = styled(Pressable)`
  align-self: center;
`;

export const VersionText = styled(Text).attrs(({ theme }) => ({
  h4: true,
  weight: 600,
  color: theme.colors.grey
}))`
  text-align: center;
`;
