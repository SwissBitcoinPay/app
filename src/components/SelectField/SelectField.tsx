import { forwardRef, useCallback, useMemo } from "react";
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
      label: labelProps,
      value: valueProps,
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

    const value = useMemo(
      () => props.items.find((i) => i.value === valueProps)?.label || "",
      [props.items, valueProps]
    );

    const label = useMemo(
      () => (labelProps !== undefined ? labelProps : ""),
      [labelProps]
    );

    return (
      <>
        <S.Picker
          ref={ref}
          value={value}
          {...props}
          onValueChange={onValueChange}
        />
        <BaseField
          style={style}
          value={value}
          label={label}
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
      </>
    );
  }
);
