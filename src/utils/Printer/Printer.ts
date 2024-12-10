import SunmiPrinter from "@heasy/react-native-sunmi-printer";
import * as PrinterNative from "./Printer.native";

export enum PrinterAlignValue {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2
}

type PrinterType = (typeof PrinterNative)["Printer"];

const printLabelValue: PrinterType["printLabelValue"] = () => {};
const printText: PrinterType["printText"] = () => {};
const printQrCode: PrinterType["printQrCode"] = () => {};
const paperOut: PrinterType["paperOut"] = () => {};

const Printer = {
  printLabelValue,
  printText,
  printQrCode,
  paperOut
};

export { Printer };

// export const Printer = {};