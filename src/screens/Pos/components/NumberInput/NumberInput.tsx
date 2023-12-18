import { forwardRef, useCallback, useState } from "react";
import { PressableProps, TouchableOpacity } from "react-native";
import { BackgroundEffect } from "./components/BackgroundEffect";
import { useIsScreenSizeMin } from "@hooks";
import { platform } from "@config";
import * as S from "./styled";

const { isWeb } = platform;

type NumberInputProps = {
  value: string;
  customColor?: string;
  onPress: () => void;
  disabled?: boolean;
  noBorderRadius?: boolean;
  rounded?: "left" | "right";
  paddingBottom?: number;
};

export const NumberInput = forwardRef<TouchableOpacity, NumberInputProps>(
  (
    {
      value,
      customColor,
      noBorderRadius,
      rounded,
      paddingBottom,
      onPress: propsOnPress,
      ...props
    },
    ref
  ) => {
    const isLarge = useIsScreenSizeMin("large");

    const [effects, setEffects] = useState<{ x: number; y: number }[]>([]);

    const onPressIn = useCallback<NonNullable<PressableProps["onPressIn"]>>(
      (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setEffects([...effects, { x, y }]);
      },
      [effects]
    );

    const onPress = useCallback<NonNullable<PressableProps["onPress"]>>(
      (e) => {
        propsOnPress();
        if (
          isWeb &&
          (e as unknown as React.PointerEvent)?.nativeEvent?.pointerType === ""
        ) {
          const element = e.target as unknown as HTMLDivElement;
          onPressIn({
            // @ts-ignore
            nativeEvent: {
              locationX: element.clientWidth / 2,
              locationY: element.clientHeight / 2
            }
          });
        }
      },
      [onPressIn, propsOnPress]
    );

    return (
      <S.NumberContainer
        customColor={customColor}
        noBorderRadius={noBorderRadius}
        noExpend={value === "0"}
        rounded={rounded}
        bottomPadding={paddingBottom}
        disabled={props.disabled}
        isLargeScreen={isLarge}
      >
        <S.NumberInputContainer
          {...props}
          ref={ref}
          onPress={onPress}
          onPressIn={onPressIn}
        >
          <S.NumberInputText h2 weight={600}>
            {value}
          </S.NumberInputText>
        </S.NumberInputContainer>
        {effects.map((effect, index) => (
          <BackgroundEffect key={index} {...effect} />
        ))}
      </S.NumberContainer>
    );
  }
);
