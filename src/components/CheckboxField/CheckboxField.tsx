import { ComponentProps, useCallback } from "react";
import { Checkbox } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { platform } from "@config";
import { useTheme } from "styled-components";
import * as S from "./styled";

const { isNative } = platform;

export type CheckboxEventData = {
  value: boolean;
};

type CheckboxProps = ComponentProps<typeof Checkbox>;

type CheckboxFieldProps = CheckboxProps & {
  onChange?: (e: { nativeEvent: CheckboxEventData }) => void;
} & Pick<BaseFieldProps, "label" | "left" | "right" | "error" | "disabled">;

export const CheckboxField = ({
  label,
  disabled,
  onChange,
  value,
  style,
  ...props
}: CheckboxFieldProps) => {
  const theme = useTheme();

  const onChangeHandler = useCallback(() => {
    if (!disabled) {
      onChange?.({ nativeEvent: { value: !value } });
    }
  }, [disabled, onChange, value]);

  return (
    <S.PressableContainer
      style={style}
      disabled={disabled}
      onPress={onChangeHandler}
    >
      <Checkbox
        {...props}
        value={value}
        disabled={disabled}
        color={theme.colors.bitcoin}
        onFillColor={theme.colors.bitcoin}
        tintColors={{ true: theme.colors.bitcoin, false: theme.colors.white }}
        style={{
          margin: isNative ? -6 : 0
        }}
        onChange={onChangeHandler}
      />
      <S.LabelText weight={600} h5 onPress={onChangeHandler}>
        {label}
      </S.LabelText>
    </S.PressableContainer>
  );
};
