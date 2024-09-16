import { Children, Fragment, PropsWithChildren } from "react";
import { StyledComponentComponentProps } from "@types";
import { MarkOptional } from "ts-essentials";
import * as S from "./styled";
import { useWindowDimensions } from "react-native";
import { useIsScreenSizeMin } from "@hooks";

type ComponentStackProps = MarkOptional<
  StyledComponentComponentProps<typeof S.GapView>,
  "direction"
> & { fullWidth?: boolean };

export const ComponentStack = ({
  children,
  direction = "vertical",
  gapColor,
  gapSize,
  fullWidth,
  ...props
}: PropsWithChildren<ComponentStackProps>) => {
  const { width: windowWidth } = useWindowDimensions();
  const isLarge = useIsScreenSizeMin("large");
  const filteredChildren = Children.toArray(children).filter(
    (child) => !!child
  );
  const childrenCount = filteredChildren.length;

  return (
    <S.ComponentStack
      {...props}
      direction={direction}
      fullWidth={!isLarge && (gapColor || fullWidth) ? windowWidth : undefined}
    >
      {filteredChildren.map((child, index) => (
        <Fragment key={index}>
          {child}
          {child && index < childrenCount - 1 && (
            <S.GapView
              direction={direction}
              gapColor={gapColor}
              gapSize={gapSize}
            />
          )}
        </Fragment>
      ))}
    </S.ComponentStack>
  );
};
