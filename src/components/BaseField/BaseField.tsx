import React, {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { ColorValue, StyleProp, ViewStyle } from "react-native";
import { Label, BadgeType, Badge } from "./components";
import { useTheme } from "styled-components";
import { StyledComponentComponentProps } from "@types";
import { tupulize } from "@utils";
import * as S from "./styled";

type FieldProps = {
  onFocus: (e: never) => void;
  onBlur: (e: never) => void;
  hasLeftBadge?: boolean;
  hasRightBadge?: boolean;
  style?: Partial<ViewStyle>;
  isFocused: boolean;
};

export type BaseFieldProps<T extends FieldProps = FieldProps> = {
  component: React.ReactElement<FieldProps>;
  label?: string;
  labelLeftPadding?: number;
  style?: StyleProp<ViewStyle>;
  color?: ColorValue;
  left?: BadgeType | BadgeType[];
  right?: BadgeType | BadgeType[];
  disabled?: boolean;
  error?: string;
  value?: boolean | string;
  isDefaultFocused?: boolean;
  onFocus?: T["onFocus"];
  onBlur?: T["onBlur"];
  testID?: string;
  asListAction?: boolean;
} & Omit<StyledComponentComponentProps<typeof S.BaseFieldContainer>, "error">;

export const BaseField = <T extends FieldProps>({
  label,
  value,
  component,
  left,
  right,
  disabled,
  error,
  isDefaultFocused = false,
  onFocus: propsOnFocus,
  onBlur: propsOnBlur,
  ...props
}: BaseFieldProps<T>) => {
  const { colors } = useTheme();

  const [isPlaceholderTop, setIsPlaceholderTop] = useState(!!value);
  const [isFocused, setIsFocused] = useState(isDefaultFocused);

  const onFocus = useCallback<T["onFocus"]>(
    (e) => {
      if (disabled) return;
      propsOnFocus?.(e);
      setIsFocused(true);
      setIsPlaceholderTop(true);
    },
    [propsOnFocus, disabled]
  );

  const onBlur = useCallback<T["onBlur"]>(
    (e) => {
      propsOnBlur?.(e);
      setIsFocused(false);
      if (!value) {
        setIsPlaceholderTop(false);
      }
    },
    [value, propsOnBlur]
  );

  useEffect(() => {
    if (value !== undefined && !isFocused) {
      setIsPlaceholderTop(!!value);
    }
  }, [!!value]);

  const isError = useMemo(() => error !== undefined, [error]);

  return (
    <S.BaseFieldContainer {...props} disabled={disabled} error={isError}>
      {label && (
        <Label
          label={error || label}
          isTop={isPlaceholderTop}
          color={
            isError ? colors.error : disabled ? colors.primaryLight : undefined
          }
        />
      )}
      {typeof value === "string" && (
        <S.ValueText numberOfLines={2}>{value}</S.ValueText>
      )}
      {left && (
        <S.BadgeContainer>
          {tupulize(left).map((b, i) => (
            <Badge key={i} badge={b} error={isError} disabled={disabled} />
          ))}
        </S.BadgeContainer>
      )}
      {cloneElement<FieldProps>(component, {
        onFocus,
        onBlur,
        hasLeftBadge: !!left,
        hasRightBadge: !!right,
        isFocused
      })}
      {right && (
        <S.BadgeContainer>
          {tupulize(right).map((b, i) => (
            <Badge key={i} badge={b} error={!!error} disabled={disabled} />
          ))}
        </S.BadgeContainer>
      )}
    </S.BaseFieldContainer>
  );
};

export default BaseField;
