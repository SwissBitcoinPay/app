import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import * as S from "./styled";

type BackgroundEffectProps = {
  x: number;
  y: number;
};

const Component = Animated.createAnimatedComponent(S.BackgroundEffectContainer);

export const BackgroundEffect = ({ x, y }: BackgroundEffectProps) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 360,
        duration: 1800,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp)
      })
    ]).start();

    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.35,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp)
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1200,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp)
      })
    ]).start(() => {
      setIsFinished(true);
    });
  }, []);

  return (
    !isFinished && (
      <Component
        x={x}
        y={y}
        style={[
          {
            transform: [{ scale }],
            opacity
          }
        ]}
      />
    )
  );
};
