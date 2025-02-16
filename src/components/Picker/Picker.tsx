import { platform } from "@config";
import { forwardRef, useMemo, useState } from "react";
import RNPickerSelect, {
  PickerSelectProps,
  PickerStyle
} from "react-native-picker-select";
import { useTheme } from "styled-components";

const { isIos, isNative } = platform;
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
        isIos && isNative
          ? {
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
      [onValueChange, tmpValue]
    );

    const itemsWithColor = useMemo(
      () => items.map((i) => ({ ...i, color: colors.primary, key: i.value })),
      [colors.primary, items]
    );

    return (
      <RNPickerSelect
        ref={ref}
        {...props}
        {...selectProps}
        itemKey={tmpValue?.value || value}
        items={itemsWithColor}
        style={{
          inputAndroid: fullStyle,
          inputIOS: fullStyle,
          viewContainer: style,
          inputWeb: fullStyle
        }}
      />
    );
  }
);

const fullStyle = {
  opacity: 0,
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
};
