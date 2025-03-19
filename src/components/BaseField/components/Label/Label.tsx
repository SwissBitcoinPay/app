import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { StyledComponentComponentProps } from "@types";
import * as S from "./styled";
import { platform } from "@config";

const { isNative } = platform;

const Component = Animated.createAnimatedComponent(S.LabelText);

type LabelProps = {
  label: string;
  isLabelAsPlaceholder: boolean;
  isTop: boolean;
  hasValue: boolean;
  color?: string;
} & StyledComponentComponentProps<typeof S.LabelText>;

const animationDuration = 150;

const animationValues = {
  translateX: [12, 6],
  translateY: isNative ? [8, 0] : [11, 3],
  scale: [1, 0.7]
};

export const Label = ({
  label,
  isTop,
  isLabelAsPlaceholder,
  hasValue,
  ...props
}: LabelProps) => {
  const isRealTop = isTop && !isLabelAsPlaceholder;
  const translateX = useRef(
    new Animated.Value(animationValues.translateX[+isRealTop])
  ).current;
  const translateY = useRef(
    new Animated.Value(animationValues.translateY[+isRealTop])
  ).current;
  const scale = useRef(
    new Animated.Value(animationValues.scale[+isRealTop])
  ).current;

  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: animationValues.translateX[+isRealTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      }),
      Animated.timing(translateY, {
        toValue: animationValues.translateY[+isRealTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      }),
      Animated.timing(scale, {
        toValue: animationValues.scale[+isRealTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      })
    ]).start();
  }, [isRealTop]);

  useEffect(() => {
    if (isLabelAsPlaceholder) {
      Animated.timing(opacity, {
        toValue: hasValue ? 0 : 1,
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      }).start();
    }
  }, [hasValue, isLabelAsPlaceholder]);

  return (
    <Component
      {...props}
      weight={600}
      style={[
        {
          opacity,
          transform: [
            {
              translateX
            },
            { translateY },
            { scale }
          ]
        }
      ]}
    >
      {label}
    </Component>
  );
};
