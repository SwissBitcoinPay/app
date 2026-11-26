// Copie de react-native-use-keyboard 1.1.0 (src/index.ts), retiré du registre
// npm le 26.11.2026 : une installation neuve de l'app échouait (ETARGET), le
// build web de Netlify compris. Code inchangé, seul usage :
// `KeyboardAvoidingView`.
//
// The MIT License (MIT)
//
// Copyright (c) 2023 Apprecimate, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { useEffect, useMemo, useState } from "react";
import { Keyboard, KeyboardEventName, Platform } from "react-native";

type KeyboardInfo = {
  isVisible: boolean;
  height: number;
};

type CustomEvents = {
  show?: KeyboardEventName;
  hide?: KeyboardEventName;
};

export const useKeyboard = (customEvents?: CustomEvents) => {
  const [keyboardInfo, setKeyboardInfo] = useState<KeyboardInfo>({
    isVisible: false,
    height: 0
  });

  const events = useMemo(
    () => ({
      show:
        customEvents?.show ||
        (Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"),
      hide:
        customEvents?.hide ||
        (Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide")
    }),
    [customEvents]
  );

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(events.show, (e) => {
      setKeyboardInfo({
        isVisible: true,
        height: e.endCoordinates.height
      });
    });

    const keyboardDidHideListener = Keyboard.addListener(events.hide, () => {
      setKeyboardInfo({
        isVisible: false,
        height: 0
      });
    });

    return () => {
      keyboardDidHideListener?.remove();
      keyboardDidShowListener?.remove();
    };
  }, [events]);

  return {
    isVisible: keyboardInfo.isVisible,
    height: keyboardInfo.height
  };
};
