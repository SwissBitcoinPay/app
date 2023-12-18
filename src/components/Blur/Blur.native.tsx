import BlurView from "react-native-blur-effect";
// import * as S from "./styled";

type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;

export type BlurProps = {
  blurRadius: number;
  backgroundColor?: RGBA;
  zIndex?: number;
};

export const Blur = BlurView;
