import {
  printText,
  paperOut,
  printQrCode,
  printBitmap,
  NyxFont
} from "react-native-nyx-printer";

export const printLabelValue = async (label: string, value: string) => {
  try {
    const TOTAL_WIDTH = 27;
    const SPACE = " ";
    const THOUSAND_SPACE = " ";

    // eslint-disable-next-line no-irregular-whitespace
    const thousandsSpaceNb = value.match(/ /g)?.length || 0;

    const text = `${label}${SPACE.repeat(
      TOTAL_WIDTH - label.length - value.length
    )}${THOUSAND_SPACE.repeat(thousandsSpaceNb)}${value}`;
    await printText(text, {
      font: NyxFont.monospace,
      textSize: 12,
      underline: false,
      textScaleX: 1.0,
      textScaleY: 1.0,
      align: 0,
      italic: false,
      strikethrough: false,
      color: 0x000000
    });
  } catch (e) {
    console.error("error", e);
  }
};

const Printer = {
  printLabelValue,
  printText,
  printQrCode,
  paperOut,
  printBitmap
};

export { Printer };
