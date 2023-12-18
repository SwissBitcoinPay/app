import { forwardRef, useCallback } from "react";
import { BaseField } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { StyledComponentComponentProps } from "@types";
import { ItemValue, Picker } from "@react-native-picker/picker/typings/Picker";
import * as S from "./styled";

type PickerProps = Omit<
  StyledComponentComponentProps<typeof S.Picker>,
  "hasLeftBadge" | "hasRightBadge"
>;

type SelectFieldProps = PickerProps & {
  onChange?: (event: { nativeEvent: { text: ItemValue } }) => void;
} & Pick<
    BaseFieldProps,
    "value" | "label" | "left" | "right" | "error" | "disabled"
  >;

export const SelectField = forwardRef<Picker<ItemValue>, SelectFieldProps>(
  (
    {
      style,
      label,
      value,
      left,
      right,
      error,
      onChange,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const onValueChange = useCallback(
      (newValue: ItemValue) => {
        onChange?.({ nativeEvent: { text: newValue } });
      },
      [onChange]
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
        onFocus={onFocus}
        onBlur={onBlur}
        component={
          <S.Picker
            ref={ref}
            selectedValue={`${value}`}
            onValueChange={onValueChange}
            {...props}
          />
        }
      />
    );
  }
);
