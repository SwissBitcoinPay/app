import { BaseField, Text } from "@components";
import styled from "styled-components";

export const FileBaseField = styled(BaseField)`
  background-color: ${({ theme }) => theme.colors.bitcoin};
`;

export const FilePicker = styled("input").attrs(() => ({ type: "file" }))`
  position: absolute;
  opacity: 0;
  height: 100%;
  width: 100%;
  border: 0px;
  z-index: 10;
  cursor: pointer;
  font-size: 0px;
`;
