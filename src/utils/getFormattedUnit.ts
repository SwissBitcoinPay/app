import { numberWithSpaces, decimalSeparator } from "@utils";

export const getFormattedUnit = (
  amount: number,
  unit: string,
  floating = 2,
  trailingDecimal = false
) => {
  let prefix = "";
  if (amount > 0 && amount < 0.01) {
    amount = 0.01;
    prefix = `< `;
  }

  if (unit === "sat" || unit === "sats") {
    return `${prefix}${numberWithSpaces(amount)} sats`;
  } else if (!unit) {
    return `${prefix}${amount}`;
  }

  let result = Intl.NumberFormat(undefined, {
    style: "currency",
    currency: unit,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: floating,
    maximumFractionDigits: floating
  }).format(amount);

  if (trailingDecimal) {
    result = result.replace("0", `0${decimalSeparator}`);
  }

  return `${prefix}${result}`;
};
