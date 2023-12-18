import styled from "styled-components";
import { View, Text, QR, Button, Image } from "@components";

export const ConnectPageContainer = styled(View)`
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

export const ConnectPageTitleText = styled(Text)`
  text-align: center;
`;

export const ActivationQR = styled(QR)`
  margin: 32px 0px;
  border-radius: 8px;
  overflow: hidden;
`;

export const AppsContainer = styled(View)`
  display: flex;
  position: relative;

  margin-top: 32px;
  width: fit-content;
  user-select: none;
  flex-direction: row;
`;

export const AppIconLink = styled(Button)`
  display: flex;
  position: relative;
  height: fit-content;
  overflow: hidden;
  height: 48px;
  border-radius: 6.4px;

  & ~ & {
    margin-left: 16px;
    border-radius: 8.2px;
  }
`;

export const AppIconImg = styled(Image)`
  height: 100%;
`;
