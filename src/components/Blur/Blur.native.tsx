import { View } from "@components";

type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;

export type BlurProps = {
  blurRadius: number;
  backgroundColor?: RGBA;
  zIndex?: number;
};

export const Blur = ({ backgroundColor, zIndex }: BlurProps) => (
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
