import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ColorValue } from "react-native";
import { Text } from "@components";
import { IntRange } from "@types";
import { Bar, BarPropTypes } from "react-native-progress";
import { useTheme } from "styled-components";
import * as S from "./styled";

type ProgressBarProps = Omit<BarPropTypes, "progress"> & {
  createdAt: number;
  delay: number;
  timer: string;
  colorConfig?: {
    [k in IntRange<1, 101>]?: ColorValue;
  };
};

const PROGRSS_BAR_HEIGHT = 24;
const PROGRSS_BAR_BORDER_WIDTH = 2;

export const ProgressBar = ({
  createdAt,
  delay,
  colorConfig,
  timer,
  ...props
}: ProgressBarProps) => {
  const { colors } = useTheme();

  const getProgress = useCallback(() => {
    const now = Math.round(Date.now() / 1000);
    const timeElapsed = now - createdAt;
    const newProgress = timeElapsed / delay;

    return 1 - newProgress;
  }, [createdAt, delay]);

  const [progress, setProgress] = useState<number>(getProgress());

  const currentColor = useMemo(() => {
    const colorKeys = Object.keys(colorConfig || {});

    const filteredColorkeys = colorKeys
      .map((c) => parseInt(c))
      .filter((c) => c >= progress * 100);

    const maxValue = Math.min(...filteredColorkeys);
    return colorConfig?.[maxValue as keyof typeof colorConfig];
  }, [colorConfig, progress]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setProgress(getProgress());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <Bar
      useNativeDriver
      width={null}
      progress={progress}
      color={(currentColor || colors.grey) as string}
      height={PROGRSS_BAR_HEIGHT}
      borderRadius={(PROGRSS_BAR_HEIGHT + PROGRSS_BAR_BORDER_WIDTH) / 2}
      animationType="spring"
      borderWidth={PROGRSS_BAR_BORDER_WIDTH}
      {...props}
    >
      <S.ProgressBarContent direction="horizontal" gapSize={6}>
        <ActivityIndicator
          color={colors.white}
          size="small"
          style={{ transform: [{ scale: 0.9 }] }}
        />
        <Text h5 weight={600} color={colors.white as string}>
          {timer}
        </Text>
      </S.ProgressBarContent>
    </Bar>
  );
};
