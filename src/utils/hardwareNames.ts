import { HardwareType } from "@config";

export const hardwareNames: { [k in HardwareType]: string } = {
  bitbox02: "BitBox02",
  ledger: "Ledger"
};
