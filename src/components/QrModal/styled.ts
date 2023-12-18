import styled from "styled-components";
import { QR } from "@components";

export const QRContent = styled(QR)`
  padding: 10px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;
