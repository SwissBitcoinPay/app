import { useCallback, useMemo, useState } from "react";
import { useTheme } from "styled-components";
import { StyledComponentComponentProps } from "@types";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { MarkOptional, XOR } from "ts-essentials";
import { Clipboard } from "@utils";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import * as S from "./styled";

type RootButtonProps = StyledComponentComponentProps<typeof S.Button>;

type ButtonProps = {
  title?: string;
  icon?: IconProp;
  type?: "primary" | "success" | "error" | "bitcoin";
  isLoading?: boolean;
  disabled?: boolean;
  secondaryColor?: string;
} & MarkOptional<
  Omit<RootButtonProps, "onPress">,
  "mode" | "primaryColor" | "size" | "isRound"
> &
  XOR<
    {
      onPress: RootButtonProps["onPress"];
    },
    { copyContent?: string }
  >;

export const Button = ({
  title,
  type,
  mode = "normal",
  size = "medium",
  isLoading,
  disabled = isLoading,
  copyContent,
  secondaryColor: propsSecondaryColor,
  icon = copyContent ? faCopy : undefined,
  android_ripple,
  children,
  ...props
}: ButtonProps) => {
  const theme = useTheme();
  const [isContentCopied, setIsContentCopied] = useState(false);

  const primaryColor = useMemo(() => {
    switch (type) {
      case "primary":
        return theme.colors.primary;
      case "success":
        return theme.colors.success;
      case "bitcoin":
        return theme.colors.bitcoin;
      case "error":
        return theme.colors.error;
      default:
        return theme.colors.white;
    }
  }, [type, theme]);

  const secondaryColor = useMemo(() => {
    if (propsSecondaryColor) {
      return propsSecondaryColor;
    }
    if (disabled) {
      return theme.colors.greyLight;
    }
    if (mode === "normal") {
      return type ? theme.colors.white : theme.colors.primary;
    } else {
      return primaryColor;
    }
  }, [
    propsSecondaryColor,
    disabled,
    mode,
    theme.colors.greyLight,
    theme.colors.white,
    theme.colors.primary,
    type,
    primaryColor
  ]);

  const loaderSize = useMemo(() => {
    switch (size) {
      case "small":
        return 20;
      case "medium":
        return 36;
      case "large":
        return 58;
    }
  }, [size]);

  const onCopyContent = useCallback(() => {
    if (copyContent && Clipboard.setString(copyContent)) {
      setIsContentCopied(true);
      setTimeout(() => {
        setIsContentCopied(false);
      }, 2000);
    }
  }, [copyContent]);

  return (
    <S.Button
      onPress={onCopyContent}
      {...props}
      mode={mode}
      size={size}
      primaryColor={primaryColor}
      disabled={disabled || isLoading}
      isRound={!!icon && !title}
      android_ripple={
        android_ripple !== undefined
          ? android_ripple
          : {
              color: "rgba(0, 0, 0, 0.2)",
              foreground: true
            }
      }
    >
      {children && (
        <S.ButtonBackgroundContainer>{children}</S.ButtonBackgroundContainer>
      )}
      <S.ButtonContent size={size}>
        {(icon || isContentCopied) && (
          <S.ButtonIcon
            icon={isContentCopied ? faCheck : (icon as IconProp)}
            buttonSize={size}
            color={secondaryColor}
          />
        )}
        {title && (
          <S.ButtonText
            numberOfLines={1}
            weight={700}
            buttonSize={size}
            color={!isLoading ? secondaryColor : "transparent"}
            hasIcon={!!icon}
          >
            {title}
          </S.ButtonText>
        )}
        {isLoading && <S.ButtonLoader size={loaderSize} />}
      </S.ButtonContent>
    </S.Button>
  );
};
