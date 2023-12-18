import { PickerItemProps } from "@react-native-picker/picker";

export const DummyItem = (props: PickerItemProps) => (
  // @ts-ignore
  <option {...props} hidden selected />
);
