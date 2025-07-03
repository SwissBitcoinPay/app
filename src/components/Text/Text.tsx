import { PropsWithChildren, forwardRef } from "react";
import { Text as RootText, TextProps as RootTextProps } from "react-native";
import styled from "styled-components";
import { platform } from "@config";

const { isNative } = platform;

export type TextProps = RootTextProps &
  PropsWithChildren<
    {
      [key in
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6"
        | "h7"
        | "h8"
        | "h9"]?: boolean;
    } & {
      weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
      italic?: boolean;
      selectable?: boolean;
      color?: string;
      centered?: boolean;
    }
  >;

export const Text = forwardRef<RootText, TextProps>((props, ref) => (
  <StyledText ref={ref} {...props} />
));

const StyledText = styled(RootText)<TextProps>`
  margin: 0px;
  include-font-padding: false;
  text-align-vertical: center;
  ${({
    theme,
    color,
    italic,
    weight,
    selectable,
    centered,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    h7,
    h8,
    h9
  }) => {
    const fontSize = (() => {
      switch (true) {
        case !!h1:
          return 48;
        case !!h2:
          return 32;
        case !!h3:
          return 22;
        case !!h4:
          return 16;
        case !!h5:
          return 14;
        case !!h6:
          return 13;
        case !!h7:
          return 9;
        case !!h8:
          return 8;
        case !!h9:
          return 6.5;
        default:
          return 19;
      }
    })();

    return `
      color: ${typeof color === "string" ? color : theme.colors.primary};
      font-family: Poppins-${(() => {
        switch (weight) {
          case 100:
            return "Thin";
          case 200:
            return "ExtraLight";
          case 300:
            return "Light";
          case 400:
            return !italic ? "Regular" : "";
          case 500:
            return "Medium";
          case 600:
            return "SemiBold";
          case 700:
            return "Bold";
          case 800:
            return "ExtraBold";
          case 900:
            return "Black";
          default:
            return "Regular";
        }
      })()}${italic ? "Italic" : ""};
      
      font-size: ${fontSize}px;
      line-height: ${fontSize * (isNative ? 1.35 : 1.2)}px;

      ${!selectable ? "user-select: none;" : ""}
      ${centered ? "text-align: center;" : ""}
    `;
  }}

  ${!isNative ? "font-weight: 400;" : ""}
`;
