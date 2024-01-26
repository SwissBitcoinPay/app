import { forwardRef, useCallback } from "react";
import { BaseField } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { StyledComponentComponentProps } from "@types";
import RNPickerSelect, { Item } from "react-native-picker-select";
import * as S from "./styled";

type PickerProps = Omit<
  StyledComponentComponentProps<typeof S.Picker>,
  "hasLeftBadge" | "hasRightBadge"
>;

type SelectFieldProps = PickerProps & {
  onChange?: (event: { nativeEvent: { text: Item["label"] } }) => void;
} & Pick<
    BaseFieldProps,
    "value" | "label" | "left" | "right" | "error" | "disabled"
  >;

export const SelectField = forwardRef<RNPickerSelect, SelectFieldProps>(
  (
    {
      style,
      label,
      value,
      left,
      right,
      error,
      onChange,
      onValueChange: propsOnValueChange,
      ...props
    },
    ref
  ) => {
    const onValueChange = useCallback(
      (newValue: Item["label"], index: number) => {
        propsOnValueChange?.(newValue, index);
        onChange?.({ nativeEvent: { text: newValue } });
      },
      [propsOnValueChange, onChange]
    );

    return (
      <BaseField
        style={style}
        value={props.items.find((i) => i.value === value)?.label || ""}
        label={label !== undefined ? label : ""}
        disabled={props.disabled}
        left={left}
        right={right}
        error={error}
        component={
          <S.Picker
            ref={ref}
            value={value}
            {...props}
            onValueChange={onValueChange}
          />
        }
      />
    );
  }
);
