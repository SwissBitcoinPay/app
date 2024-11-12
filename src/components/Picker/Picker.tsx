import { platform } from "@config";
import { forwardRef, useMemo, useState } from "react";
import RNPickerSelect, {
  PickerSelectProps,
  PickerStyle
} from "react-native-picker-select";

const { isIos } = platform;
type PickerRootProps = Omit<PickerSelectProps, "style"> & {
  style?: PickerStyle["viewContainer"];
};

export const Picker = forwardRef<RNPickerSelect, PickerRootProps>(
  ({ style, onValueChange, ...props }, ref) => {
    const [tmpValue, setTmpValue] = useState<{
      value: string;
      index: string;
    }>();

    const selectProps = useMemo<Partial<PickerSelectProps>>(
      () =>
        isIos
          ? {
              onValueChange: (v, i) => setTmpValue({ value: v, index: i }),
              onClose: () => {
                if (tmpValue) {
                  onValueChange(tmpValue?.value, tmpValue?.index);
                }
              }
            }
          : {
              onValueChange
            },
      [onValueChange, tmpValue]
    );

    return (
      <RNPickerSelect
        ref={ref}
        {...props}
        {...selectProps}
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
