import { Text } from "@components";
import { createElement } from "react";

const ctx = document.createElement("canvas").getContext("2d");

export type MeasureTextFont = {
  fontSize: number;
  fontFamily: string;
};

export const measureText = (
  text: string,
  { fontSize, fontFamily }: MeasureTextFont
) => {
  return new Promise<{ width: number }>((resolve) => {
    const elem = document.createElement("div");
    if (ctx) {
      ctx.font = `${fontSize}px ${fontFamily}`;
      resolve({ width: ctx.measureText(text).width || 0 });
    } else {
      resolve({ width: 0 });
    }
  });
};
