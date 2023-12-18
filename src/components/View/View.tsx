import { forwardRef } from "react";
import { View as RootView, ViewProps } from "react-native";

export const View = forwardRef<RootView, ViewProps>((props, ref) => (
  <RootView ref={ref} {...props} />
));
