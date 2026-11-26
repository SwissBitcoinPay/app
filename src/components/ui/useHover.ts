import { useState } from "react";

/** Hover state for Pressable (only fires with a pointer: web, iPad, desktop). */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    hoverProps: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false)
    }
  };
}
