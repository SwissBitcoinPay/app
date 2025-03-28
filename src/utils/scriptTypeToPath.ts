import { ScriptType } from "./Bitbox/api/account";

export const scriptTypeToPath = (format: ScriptType) => {
  switch (format) {
    case "p2pkh":
      return "44'/0'/0'" as const;
    case "p2wpkh-p2sh":
      return "49'/0'/0'" as const;
    case "p2wpkh":
      return "84'/0'/0'" as const;
    case "p2tr":
      return "86'/0'/0'" as const;
  }
};
