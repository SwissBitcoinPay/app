import { mergeDeep } from "@utils";
import { animated, useSpring } from "@react-spring/native";
import { PropsWithChildren, createContext, useCallback, useState } from "react";
import { ThemeProvider, DefaultTheme } from "styled-components";
import { theme } from "@config/themes";
import { ToastProvider } from "react-native-toast-notifications";
import { DeepPartial } from "ts-essentials";
import { ColorValue } from "react-native";
import { useSafeAreaInsets } from "@hooks";
import { Toast } from "@components";

type SBPThemeContextType = {
  setTheme: (newTheme: DefaultTheme) => void;
  setBackgroundColor: (
    newBackgroundColor: ColorValue,
    duration?: number
  ) => void;
};

const DEFAULT_BACKGROUND_CHANGE_DURATION = 1000;

// @ts-ignore
export const SBPThemeContext = createContext<SBPThemeContextType>({});

export const SBPThemeContextProvider = ({ children }: PropsWithChildren) => {
  const { bottom } = useSafeAreaInsets();

  const [currentTheme, setCurrentTheme] = useState(theme);

  const setTheme = useCallback((newTheme: DeepPartial<DefaultTheme>) => {
    setCurrentTheme(mergeDeep({ ...theme }, newTheme));
  }, []);

  const [backgroundColorSpring, api] = useSpring(() => ({
    from: { backgroundColor: currentTheme.colors.primary as string }
  }));

  const setBackgroundColor = useCallback<
    SBPThemeContextType["setBackgroundColor"]
  >(
    (newBackgroundColor, duration = DEFAULT_BACKGROUND_CHANGE_DURATION) => {
      api.start({
        immediate: duration === 0,
        config: { duration },
        to: {
          backgroundColor: newBackgroundColor as string
        }
      });
    },
    [api]
  );

  return (
    <SBPThemeContext.Provider
      value={{
        setTheme,
        setBackgroundColor
      }}
    >
      <ThemeProvider theme={currentTheme}>
        <ToastProvider offsetBottom={bottom} renderToast={Toast}>
          <animated.View
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...backgroundColorSpring
            }}
          >
            {children}
          </animated.View>
        </ToastProvider>
      </ThemeProvider>
    </SBPThemeContext.Provider>
  );
};
