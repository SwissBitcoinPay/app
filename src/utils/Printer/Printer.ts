import SunmiPrinter from "@heasy/react-native-sunmi-printer";

export enum PrinterAlignValue {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2
}

export const Printer = {} as unknown as Omit<
  typeof SunmiPrinter,
  "setAlignment"
> & {
  setAlignment: (a: PrinterAlignValue) => void;
};
