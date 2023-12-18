import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { platform } from "@config";
import { useSafeAreaInsets } from "@hooks";
import { useKeyboard } from "react-native-use-keyboard";

const { isAndroid } = platform;

const ANIMATION_DURATION = 300;

export const KeyboardAvoidingView = ({ children }: PropsWithChildren) => {
  const { height: keyboardHeight } = useKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const normalHeight = useMemo(
    () => top + windowHeight + bottom,
    [top, windowHeight, bottom]
  );

  const height = useRef(new Animated.Value(normalHeight)).current;

  useEffect(() => {
    if (keyboardHeight > 0) {
      setIsKeyboardVisible(true);
    }
    if (isAndroid) {
      Animated.timing(height, {
        toValue: normalHeight - keyboardHeight,
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
        easing: Easing.out(Easing.exp)
      }).start(() => {
        if (keyboardHeight === 0) {
          setIsKeyboardVisible(false);
        }
      });
    }
  }, [keyboardHeight]);

  return (
    <Animated.View
      style={{
        ...(isAndroid && isKeyboardVisible
          ? { height }
          : {
              paddingBottom: keyboardHeight,
              flex: 1
            })
      }}
    >
      {children}
    </Animated.View>
  );
};
