import { platform } from "@config/platform";

type DirectionType =
  | "bottom"
  | "top"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

const adjustShadowOffsetOnDirection = (
  level: number,
  direction: DirectionType
) => {
  const distance = Math.floor(level * 0.5);
  switch (direction) {
    case "bottom":
      return { width: 0, height: distance };
    case "top":
      return { width: 0, height: -distance };
    case "left":
      return { width: -distance, height: 0 };
    case "right":
      return { width: distance, height: 0 };
    case "topLeft":
      return { width: -distance, height: -distance };
    case "topRight":
      return { width: distance, height: -distance };
    case "bottomLeft":
      return { width: -distance, height: distance };
    case "bottomRight":
      return { width: -distance, height: distance };
    default:
      return { width: 0, height: distance };
  }
};

const interpolate = (
  i: number,
  a: number,
  b: number,
  a2: number,
  b2: number
) => {
  return ((i - a) * (b2 - a2)) / (b - a) + a2;
};

/**
 * @param {number} level Shadow level you want to set (default to 4)
 * @param {string} shadowColor Shadow color you want to set (default to Black)
 */
export const getShadow = (params?: {
  level?: number;
  shadowColor?: string;
  direction?: DirectionType;
}) => {
  const level = params?.level !== undefined ? params.level : 8;
  const shadowColor = params?.shadowColor || "#666";
  const direction = params?.direction || "bottom";
  const shadowOffset = adjustShadowOffsetOnDirection(level, direction);
  const shadowOpacity = Number(interpolate(level, 1, 24, 0.2, 0.27).toFixed(2));
  const shadowRadius = Number(interpolate(level, 1, 38, 1, 48).toFixed(2));

  const shadowSpread = Number(interpolate(level, 1, 24, 0, 0).toFixed(2));

  return platform.isAndroid
    ? ` shadow-color: ${shadowColor};
        elevation: ${level};
      `
    : ` shadow-color: ${shadowColor};
        shadow-offset: ${shadowOffset.width}px ${shadowOffset.height}px;
        shadow-opacity: ${shadowOpacity};
        shadow-radius: ${shadowRadius}px ${shadowSpread}px;
      `;
};
