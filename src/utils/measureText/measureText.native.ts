import RNTextSize from "react-native-text-size";
import { MeasureTextFont } from "./measureText";

export const measureText = (
  text: string,
  { fontSize, fontFamily }: MeasureTextFont
) => {
  return RNTextSize.measure({
    text,
    fontSize,
    fontFamily: fontFamily as string
  });
};
