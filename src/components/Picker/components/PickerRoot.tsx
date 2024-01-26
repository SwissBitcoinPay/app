import { Picker as RootPicker, PickerIOS } from "@react-native-picker/picker";
import { platform } from "@config";

const { isIos, isNative } = platform;

export const PickerRoot = (isIos && isNative
  ? PickerIOS
  : RootPicker) as unknown as typeof RootPicker;
