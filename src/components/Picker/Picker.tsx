import { forwardRef } from "react";
import RNPickerSelect, {
  PickerSelectProps,
  PickerStyle
} from "react-native-picker-select";

type PickerRootProps = Omit<PickerSelectProps, "style"> & {
  style?: PickerStyle["viewContainer"];
};

export const Picker = forwardRef<RNPickerSelect, PickerRootProps>(
  ({ style, ...props }, ref) => (
    <RNPickerSelect
      ref={ref}
      {...props}
      style={{
        viewContainer: style,
        inputWeb: style
      }}
    />
  )
);
