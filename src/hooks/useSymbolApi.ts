import { easings, useSpring } from "@react-spring/native";
import { useCallback } from "react";

const VISIBLE_STYLE = {
  opacity: 1
};

const HIDDEN_STYLE = {
  opacity: 0
};

const SYMBOL_ANIMATION_CONFIG = {
  duration: 250,
  easing: easings.easeOutQuad
};

export const useSymbolApi = () => {
  const [springs, api] = useSpring(() => ({
    from: HIDDEN_STYLE
  }));

  const setVisible = useCallback(
    async (isVisible: boolean) => {
      await api.start(() => ({
        from: !isVisible ? VISIBLE_STYLE : HIDDEN_STYLE,
        to: isVisible ? VISIBLE_STYLE : HIDDEN_STYLE,
        config: SYMBOL_ANIMATION_CONFIG
      }));
    },
    [api]
  );

  return [springs, setVisible] as const;
};
