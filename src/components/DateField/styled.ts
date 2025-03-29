import styled from "styled-components";
import { Pressable } from "@components";

export const DatePicker = styled("input")`
  position: absolute;
  opacity: 0;
  height: 100%;
  width: 100%;
  border: 0px;
  background-color: transparent;
  padding: 0px 12px;
  padding-top: 8px;
  font-size: 16px;
  font-family: Poppins-Medium;
  color: ${({ theme }) => theme.colors.primary};
`;

export const FullSizePressable = styled(Pressable)`
  z-index: 1;
  position: absolute;
  width: 100%;
  height: 100%;
`;
