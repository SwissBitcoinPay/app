import styled from "styled-components";
import { Pressable as RootPressable, Text as RootText } from "@components";
import { platform } from "@config";

const { isNative } = platform;

export const Pressable = styled(RootPressable)`
  text-decoration: none;
  ${!isNative ? "display: unset;" : ""}
`;

export const Text = styled(RootText)`
  text-decoration: none;
  color: ${({ theme }) => theme.colors.link};

  position: relative;
  top: ${isNative ? "5.3px" : "-0.5px"};
`;
