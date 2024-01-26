import { forwardRef } from "react";
import RNPickerSelect, { PickerSelectProps } from "react-native-picker-select";
import { StyleProp, ViewStyle } from "react-native";

type PickerRootProps = Omit<PickerSelectProps, "style"> & {
  style?: StyleProp<ViewStyle>;
};

export const Picker = forwardRef<RNPickerSelect, PickerRootProps>(
  ({ style = {}, ...props }, ref) => {
    return (
      <RNPickerSelect
        ref={ref}
        {...props}
        style={{
          inputWeb: style,
          viewContainer: style
        }}
      />
    );
  }
);
