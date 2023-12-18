import { cloneElement, isValidElement } from "react";
import { useTheme } from "styled-components";
import { Icon, Pressable, Text } from "@components";
import { IconLookup } from "@fortawesome/fontawesome-svg-core";
import { isIcon } from "@utils";
import { StyledComponentComponentProps } from "@types";
import { XOR } from "ts-essentials";
import { ColorValue } from "react-native";
import * as S from "./styled";

const DEFAULT_ICON_SIZE = 18;

export type BadgeType = XOR<
  {
    icon: IconLookup;
    onPress?: () => void;
    color?: ColorValue;
    isAlwaysClickable?: boolean;
  },
  React.ReactElement<Pick<BadgeProps, "error" | "disabled">>
>;

type BadgeProps = {
  badge: BadgeType;
  error?: boolean;
  disabled?: boolean;
  size?: number;
  style?: StyledComponentComponentProps<typeof S.BadgeContainer>;
};

export const Badge = ({
  badge,
  error,
  disabled,
  size = DEFAULT_ICON_SIZE,
  style
}: BadgeProps) => {
  const { colors } = useTheme();

  return (
    <S.BadgeContainer
      style={style}
      as={badge.onPress ? Pressable : undefined}
      onPress={badge.onPress}
      disabled={disabled && !badge.isAlwaysClickable}
    >
      {isValidElement(badge) ? (
        cloneElement(badge, { error, disabled })
      ) : isIcon(badge.icon) ? (
        <Icon
          icon={badge.icon}
          size={size}
          {...(error
            ? { color: colors.error }
            : {
                color: badge.color || colors.primary
              })}
        />
      ) : (
        typeof badge === "string" && <Text>{badge}</Text>
      )}
    </S.BadgeContainer>
  );
};
