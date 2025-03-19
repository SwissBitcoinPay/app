import { forwardRef, useRef } from "react";
import { BaseField } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { StyledComponentComponentProps } from "@types";
import * as S from "./styled";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";

type DatePickerProps = Omit<
  StyledComponentComponentProps<typeof S.DatePicker>,
  "hasLeftBadge" | "hasRightBadge"
>;

type DateFieldProps = DatePickerProps &
  Pick<
    BaseFieldProps,
    | "value"
    | "label"
    | "left"
    | "right"
    | "error"
    | "disabled"
    | "isLabelAsPlaceholder"
  >;

export const DateField = forwardRef<RNPickerSelect, DateFieldProps>(
  ({
    style,
    label,
    value,
    left,
    right,
    error,
    isLabelAsPlaceholder,
    onChange,
    ...props
  }) => {
    const ref = useRef<HTMLInputElement>(null);

    return (
      <>
        <S.DatePicker
          ref={ref}
          {...props}
          onChange={(v) => onChange({ nativeEvent: { value: v } })}
          type="date"
        />
        <BaseField
          style={style}
          value={value || ""}
          label={label}
          disabled={props.disabled}
          left={left}
          right={right || { icon: faCalendar }}
          error={error}
          isLabelAsPlaceholder={isLabelAsPlaceholder}
          component={
            <S.FullSizePressable
              onPress={() => {
                ref.current?.showPicker();
              }}
            />
          }
        />
      </>
    );
  }
);
