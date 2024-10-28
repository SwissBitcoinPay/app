import { useCallback, useEffect, useState } from "react";
import { ProgressBar } from "@components";
import { ProgressBarProps } from "@components/ProgressBar/ProgressBar";

type TimerProgressBarProps = ProgressBarProps & {
  createdAt: number;
  delay: number;
  timer: string;
};

export const TimerProgressBar = ({
  createdAt,
  delay,
  timer,
  ...props
}: TimerProgressBarProps) => {
  const getProgress = useCallback(() => {
    const now = Math.round(Date.now() / 1000);
    const timeElapsed = now - createdAt;
    const newProgress = timeElapsed / delay;

    return 1 - newProgress;
  }, [createdAt, delay]);

  const [progress, setProgress] = useState<number>(getProgress());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setProgress(getProgress());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return <ProgressBar progress={progress} text={timer} {...props} />;
};
