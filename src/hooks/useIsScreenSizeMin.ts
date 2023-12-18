import { useWindowDimensions } from "react-native";
import { screenSizes } from "@config";

export const useIsScreenSizeMin = (maxSize: keyof typeof screenSizes) => {
  const { width } = useWindowDimensions();

  return width > screenSizes[maxSize];
};
