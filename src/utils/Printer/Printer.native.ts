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
      font: NyxFont.monospace
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
