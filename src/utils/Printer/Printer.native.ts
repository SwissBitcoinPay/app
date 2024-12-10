import SunmiPrinter, { AlignValue } from "@heasy/react-native-sunmi-printer";
import { printText, paperOut, printQrCode } from "react-native-nyx-printer";

// export const Printer = SunmiPrinter;
// export const PrinterAlignValue = AlignValue;

export const printLabelValue = async (
  label: string,
  value: string,
  customStyle = {}
) => {
  try {
    const TOTAL_WIDTH = customStyle ? 20 : 27;
    const SPACE = " ";

    const text = `${label}${SPACE.repeat(
      TOTAL_WIDTH - label.length - value.length
    )}${value}`;
    await printText(text, {
      font: 4, // Monospace
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
  paperOut
};

export { Printer };