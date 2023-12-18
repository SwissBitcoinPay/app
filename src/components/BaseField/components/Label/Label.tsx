import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { StyledComponentComponentProps } from "@types";
import * as S from "./styled";

const Component = Animated.createAnimatedComponent(S.LabelText);

type LabelProps = {
  label: string;
  isTop: boolean;
  color?: string;
} & StyledComponentComponentProps<typeof S.LabelText>;

const animationDuration = 150;

const animationValues = {
  translateX: [12, 6],
  translateY: [11.5, 3],
  scale: [1, 0.7]
};

export const Label = ({ label, isTop, ...props }: LabelProps) => {
  const translateX = useRef(
    new Animated.Value(animationValues.translateX[+isTop])
  ).current;
  const translateY = useRef(
    new Animated.Value(animationValues.translateY[+isTop])
  ).current;
  const scale = useRef(
    new Animated.Value(animationValues.scale[+isTop])
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: animationValues.translateX[+isTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      }),
      Animated.timing(translateY, {
        toValue: animationValues.translateY[+isTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      }),
      Animated.timing(scale, {
        toValue: animationValues.scale[+isTop],
        duration: animationDuration,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease)
      })
    ]).start();
  }, [isTop]);

  return (
    <Component
      {...props}
      weight={600}
      style={[
        {
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
