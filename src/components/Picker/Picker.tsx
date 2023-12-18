import { forwardRef, useCallback, useState } from "react";
import { ItemValue } from "@react-native-picker/picker/typings/Picker";
import { PickerRoot } from "./components/PickerRoot";
import { Picker as RootPicker, PickerProps } from "@react-native-picker/picker";
import { DummyItem } from "./components/DummyItem";

type ItemProps = {
  value: string;
  label: string;
};

type PickerRootProps = PickerProps & {
  items: readonly ItemProps[];
};

export const Picker = forwardRef<RootPicker<ItemValue>, PickerRootProps>(
  ({ items, ...props }, ref) => {
    const [isDummyItemEnabled, setIsDummyItemEnabled] = useState(true);

    const onFocus = useCallback(() => {
      setIsDummyItemEnabled(false);
    }, []);

    const onBlur = useCallback(() => {
      setIsDummyItemEnabled(true);
    }, []);

    return (
      <PickerRoot ref={ref} {...props} onBlur={onBlur} onFocus={onFocus}>
        <DummyItem label="" enabled={isDummyItemEnabled} />
        {items.map((value, index) => (
          <PickerRoot.Item
            key={index}
            value={value.value}
            label={value.label}
          />
        ))}
      </PickerRoot>
    );
  }
);
