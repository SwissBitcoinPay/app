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
  ...props
}: CheckboxFieldProps) => {
  const theme = useTheme();

  const onChangeHandler = useCallback(() => {
    onChange?.({ nativeEvent: { value: !value } });
  }, [onChange, value]);

  return (
    <S.PressableContainer onPress={onChangeHandler}>
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
      />
      <S.LabelText weight={600} h5>
        {label}
      </S.LabelText>
    </S.PressableContainer>
  );
};
