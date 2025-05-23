import styled from "styled-components";
import { Picker as RootPicker } from "@components";
import { platform } from "@config";

const { isWeb } = platform;

export const Picker = styled(RootPicker)`
  position: absolute;
  ${isWeb ? "opacity: 0;" : ""}
  height: 100%;
  width: 100%;
  border: 0px;
  background-color: transparent;
  padding: 0px 12px;
  padding-top: 8px;
  font-size: 16px;
  font-family: Poppins-Medium;
  color: ${({ theme }) => theme.colors.primary};
  z-index: 1;
`;
