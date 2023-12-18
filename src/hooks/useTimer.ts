import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type UseTimerProps = {
  createdAt?: number;
  delay?: number;
  stop?: boolean;
};

export const useTimer = ({ createdAt, delay, stop = false }: UseTimerProps) => {
  const [timer, setTimer] = useState("");

  const defferedValue = useDeferredValue(timer);

  const { t } = useTranslation(undefined, { keyPrefix: "common" });

  const updateTimer = useCallback(() => {
    if (createdAt && delay) {
      const timeNow = Math.round(Date.now() / 1000);
      let secondsLeft = createdAt + delay - timeNow;

      let months = 0;
      let weeks = 0;
      let days = 0;
      let hours = 0;
      let minutes = 0;
      let seconds = 0;

      // More than 1 month
      if (secondsLeft >= 2630000) {
        const monthsLeft = Math.floor(secondsLeft / 2630000);
        secondsLeft -= monthsLeft * 2630000;
        months = monthsLeft;
      }
      // More than 1 week
      if (secondsLeft >= 604800) {
        const weeksLeft = Math.floor(secondsLeft / 604800);
        secondsLeft -= weeksLeft * 604800;
        weeks = weeksLeft;
      }
      // More than 1 day
      if (secondsLeft >= 86400) {
        const daysLeft = Math.floor(secondsLeft / 86400);
        secondsLeft -= daysLeft * 86400;
        days = daysLeft;
      }
      // More than 1 hour
      if (secondsLeft >= 3600) {
        const hoursLeft = Math.floor(secondsLeft / 3600);
        secondsLeft -= hoursLeft * 3600;
        hours = hoursLeft;
      }
      // More than 1 minute
      if (secondsLeft >= 60) {
        const minutesLeft = Math.floor(secondsLeft / 60);
        secondsLeft -= minutesLeft * 60;
        minutes = minutesLeft;
      }
      seconds = secondsLeft;

      setTimer(
        `${months ? `${months} ${t("months")} ` : ""}${
          !months && weeks ? `${weeks} ${t("weeks")} ` : ""
        }${!months && days ? `${days} ${t("days")} ` : ""}${
          !months && !weeks && hours ? `${hours} ${t("hours")} ` : ""
        }${
          !months && !days && !weeks
            ? `${minutes && minutes < 10 ? "0" : ""}${minutes || 0}:${
                seconds && seconds > 0
                  ? `${seconds < 10 ? "0" : ""}${seconds}`
                  : "00"
              }`
            : ""
        }`
      );
    }
  }, [createdAt, delay, t]);

  useEffect(() => {
    if (createdAt && delay && !stop) {
      updateTimer();
      const intervalId = setInterval(updateTimer, 1000);
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [createdAt, delay, stop]);

  return defferedValue;
};
