import { useMemo } from "react";
import { ActivityIndicator, ColorValue } from "react-native";
import { Text } from "@components";
import { IntRange } from "@types";
import { Bar, BarPropTypes } from "react-native-progress";
import { useTheme } from "styled-components";
import * as S from "./styled";

type Progress = IntRange<1, 101>;

export type ProgressBarProps = Omit<BarPropTypes, "progress"> & {
  progress: Progress;
  text: string;
  isTextCentered?: boolean;
  colorConfig?: {
    [k in Progress]?: ColorValue;
  };
};

const PROGRESS_BAR_HEIGHT = 24;
const PROGRESS_BAR_BORDER_WIDTH = 2;

export const ProgressBar = ({
  progress,
  colorConfig,
  text,
  isTextCentered,
  ...props
}: ProgressBarProps) => {
  const { colors } = useTheme();

  const currentColor = useMemo(() => {
    const colorKeys = Object.keys(colorConfig || {});

    const filteredColorkeys = colorKeys
      .map((c) => parseInt(c))
      .filter((c) => c >= progress * 100);

    const maxValue = Math.min(...filteredColorkeys);
    return colorConfig?.[maxValue as keyof typeof colorConfig];
  }, [colorConfig, progress]);

  return (
    <Bar
      useNativeDriver
      width={null}
      progress={progress}
      color={(currentColor || colors.grey) as string}
      height={PROGRESS_BAR_HEIGHT}
      borderRadius={(PROGRESS_BAR_HEIGHT + PROGRESS_BAR_BORDER_WIDTH) / 2}
      animationType="spring"
      borderWidth={PROGRESS_BAR_BORDER_WIDTH}
      {...props}
    >
      <S.ProgressBarContent
        direction="horizontal"
        gapSize={6}
        {...(isTextCentered
          ? { style: { left: 0, width: "100%", justifyContent: "center" } }
          : {})}
      >
        {!isTextCentered && (
          <ActivityIndicator
            color={colors.white}
            size="small"
            style={{ transform: [{ scale: 0.9 }] }}
          />
        )}
        <Text h5 weight={600} color={colors.white as string}>
          {text}
        </Text>
      </S.ProgressBarContent>
    </Bar>
  );
};
