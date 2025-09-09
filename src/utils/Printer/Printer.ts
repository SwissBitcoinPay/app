import * as PrinterNative from "./Printer.native";

export enum PrinterAlignValue {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2
}

type PrinterType = (typeof PrinterNative)["Printer"];

const printLabelValue: PrinterType["printLabelValue"] = async () => {};
const printText: PrinterType["printText"] = async () => 0;
const printQrCode: PrinterType["printQrCode"] = async () => 0;
const paperOut: PrinterType["paperOut"] = async () => 0;
const printBitmap: PrinterType["printBitmap"] = async () => 0;

const Printer = {
  printLabelValue,
  printText,
  printQrCode,
  paperOut,
  printBitmap
};

export { Printer };
