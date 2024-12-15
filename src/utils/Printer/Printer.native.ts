import {
  printText,
  paperOut,
  printQrCode,
  printBitmap,
  NyxFont
} from "react-native-nyx-printer";

export const printLabelValue = async (
  label: string,
  value: string,
  customStyle = {}
) => {
  try {
    const TOTAL_WIDTH = !customStyle ? 20 : 27;
    const SPACE = " ";

    const text = `${label}${SPACE.repeat(
      TOTAL_WIDTH - label.length - value.length
    )}${value}`;
    await printText(text, {
      font: NyxFont.monospace,
      ...customStyle
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
