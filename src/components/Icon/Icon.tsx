import {
  FontAwesomeIcon,
  FontAwesomeIconProps
} from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { ColorValue, StyleSheet } from "react-native";
import styled from "styled-components";

type IconProps = Omit<FontAwesomeIconProps, "size" | "color"> & {
  size: number;
  color?: ColorValue | string;
};

export const Icon = styled(({ size: _size, style, ...props }: IconProps) => {
  const { color, ...flattenStyle } = useMemo(
    () => StyleSheet.flatten(style),
    [style]
  );

  return (
    <FontAwesomeIcon
      {...props}
      style={flattenStyle}
      color={(props.color as string) || color}
    />
  );
})`
  ${({ size }) => `
    width: ${size}px;
    height: ${size}px;
  `}
`;
