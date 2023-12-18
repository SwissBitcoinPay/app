import * as S from "./styled";
import { BlurProps } from "./Blur.native";

export const Blur = ({
  blurRadius,
  backgroundColor,
  zIndex,
  ...props
}: BlurProps) => (
  <S.Blur
    {...props}
    style={{
      backgroundColor,
      // @ts-ignore
      backdropFilter: `blur(${blurRadius * 1.5}px)`,
      zIndex
    }}
  />
);
