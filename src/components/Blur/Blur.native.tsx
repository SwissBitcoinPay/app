import { View } from "@components";
import { BlurView } from "@react-native-community/blur";

type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;

export type BlurProps = {
  blurRadius: number;
  backgroundColor?: RGBA;
  zIndex?: number;
  realBlur?: boolean;
};

export const Blur = ({
  backgroundColor,
  zIndex,
  blurRadius,
  realBlur
}: BlurProps) =>
  realBlur ? (
    <BlurView
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        backgroundColor
      }}
      blurType="light"
      blurAmount={blurRadius}
    />
  ) : (
    <View
      style={{
        backgroundColor,
        zIndex,
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0
      }}
    />
  );
