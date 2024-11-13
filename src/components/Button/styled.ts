import { Icon, Loader, Pressable, Text, View } from "@components";
import { getShadow } from "@utils";
import { platform } from "@config";
import styled from "styled-components";

type Mode = "normal" | "outline";
type Size = "small" | "medium" | "large";

const getPadding = (size: Size) => {
  switch (size) {
    case "small":
      return 12;
    case "medium":
      return 18;
    case "large":
      return 18;
  }
};

export const Button = styled(Pressable)<{
  mode: Mode;
  size: Size;
  primaryColor: string;
  isRound: boolean;
  isWhiteBackground?: boolean;
  noShadow?: boolean;
}>`
  ${({
    theme,
    mode,
    size,
    primaryColor,
    isRound,
    disabled,
    isWhiteBackground,
    noShadow
  }) => {
    const height = (() => {
      switch (size) {
        case "small":
          return 32;
        case "medium":
          return 48;
        case "large":
          return 74;
        default:
          return 0;
      }
    })();

    const borderSize = size === "small" ? 3 : 4;
    const borderRadius = size === "small" ? height / 2 : theme.borderRadius;

    const disabledColor = isWhiteBackground
      ? theme.colors.secondaryLight
      : theme.colors.primaryLight;

    return `
      ${
        mode === "normal"
          ? `background-color: ${!disabled ? primaryColor : disabledColor};`
          : `
            background-color: ${theme.colors.primary};
            border: ${borderSize}px solid ${
              !disabled ? primaryColor : disabledColor
            };`
      }
      border-radius: ${borderRadius}px;
      padding: 0px ${getPadding(size)}px;
      height: ${height}px;
      ${size !== "small" ? "width: 100%; flex-shrink: 1;" : ""}
      ${isRound ? `width: ${height}px; border-radius: ${height / 2}px;` : ""}
      ${disabled ? "opacity: 1;" : "cursor: pointer;"}
      ${!noShadow ? getShadow() : ""}
    `;
  }}

  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  overflow: hidden;
  box-sizing: border-box;
`;

export const ButtonContent = styled(View)`
  height: 100%;
  width: 100%;
`;

const getIconSize = (size: Size) => {
  switch (size) {
    case "small":
      return 12;
    case "medium":
      return 22;
    case "large":
      return 22;
  }
};

type ButtonIconProps = {
  buttonSize: Size;
};

export const ButtonIcon = styled(Icon)
  .attrs(({ buttonSize }: ButtonIconProps) => ({
    size: getIconSize(buttonSize)
  }))
  .withConfig({
    shouldForwardProp: (prop) => !["buttonSize"].includes(prop)
  })<ButtonIconProps>``;

type ButtonTextProps = {
  buttonSize: Size;
  hasIcon: boolean;
};

const TEXT_MARGIN = 6;

export const ButtonText = styled(Text).attrs(
  ({ buttonSize }: ButtonTextProps) => {
    return {
      h4: buttonSize === "medium" || buttonSize === "large",
      h5: buttonSize === "small"
    };
  }
)<ButtonTextProps>`
  ${({ hasIcon, buttonSize }) => {
    const iconPlusMarginSize = hasIcon
      ? getIconSize(buttonSize) + TEXT_MARGIN
      : 0;

    return `
      margin-left: ${hasIcon ? TEXT_MARGIN : 0}px;
      margin-right: ${buttonSize !== "small" ? iconPlusMarginSize : 0}px;    
      ${
        buttonSize !== "small" ? "flex: 1;" : !platform.isWeb ? "top: 1px;" : ""
      }
    `;
  }}

  position: relative;
  text-align: center;
`;

export const ButtonLoader = styled(Loader)`
  position: absolute;
  opacity: 0.85;
`;
