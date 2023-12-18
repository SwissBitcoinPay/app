import { Picker as RootPicker, PickerIOS } from "@react-native-picker/picker";
import { platform } from "@config";

const { isIos } = platform;

export const PickerRoot = (isIos
  ? PickerIOS
  : RootPicker) as unknown as typeof RootPicker;
