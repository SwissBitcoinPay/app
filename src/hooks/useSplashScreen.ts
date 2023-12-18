import { useEffect } from "react";
import { SplashScreen } from "@components";

export const useSplashScreen = () => {
  useEffect(() => {
    SplashScreen.hide({ fade: true });
  }, []);

  return null;
};
