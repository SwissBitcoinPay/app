import { useEffect } from "react";
import { BackHandler } from "react-native";
import { useLocation, useNavigate } from "@components/Router";
import { platform } from "@config/platform";

const { isWeb } = platform;

export const useBackHandler = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isWeb) {
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          const isHome = pathname === "/" || pathname === "/welcome";

          if (!isHome) {
            navigate(-1);
          }
          return !isHome;
        }
      );

      return () => backHandler.remove();
    }
  }, [navigate, pathname]);

  return null;
};
