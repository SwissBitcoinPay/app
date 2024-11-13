import { platform } from "@config";
import { forwardRef, useMemo, useState } from "react";
import RNPickerSelect, {
  PickerSelectProps,
  PickerStyle
} from "react-native-picker-select";
import { useTheme } from "styled-components";

const { isIos } = platform;
type PickerRootProps = Omit<PickerSelectProps, "style"> & {
  style?: PickerStyle["viewContainer"];
};

export const Picker = forwardRef<RNPickerSelect, PickerRootProps>(
  ({ style, value, onValueChange, items, ...props }, ref) => {
    const { colors } = useTheme();
    const [tmpValue, setTmpValue] = useState<{
      value: string;
      index: string;
    }>();

    const selectProps = useMemo<Partial<PickerSelectProps>>(
      () =>
        isIos
          ? {
              value: tmpValue?.value || value,
              onValueChange: (v, i) => setTmpValue({ value: v, index: i }),
              onClose: () => {
                if (tmpValue) {
                  onValueChange(tmpValue.value, tmpValue.index);
                  setTmpValue(undefined);
                }
              }
            }
          : {
              onValueChange
            },
      [onValueChange, tmpValue, value]
    );

    const itemsWithColor = useMemo(
      () => items.map((i) => ({ ...i, color: colors.primary })),
      [colors.primary, items]
    );

    return (
      <RNPickerSelect
        ref={ref}
        {...props}
        {...selectProps}
        items={itemsWithColor}
        style={{
          inputAndroid: {
            opacity: 0
          },
          inputIOS: {
            opacity: 0
          },
          viewContainer: style,
          inputWeb: style
        }}
      />
    );
  }
);
