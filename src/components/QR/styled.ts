import styled from "styled-components";
import QRCode from "react-native-qrcode-styled";

export const QRContainer = styled(QRCode)`
  background: ${({ theme }) => theme.colors.white};
  align-self: center;
  overflow: hidden;
`;
