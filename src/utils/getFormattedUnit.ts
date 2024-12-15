import { numberWithSpaces } from "@utils";

export const getFormattedUnit = (
  amount: number,
  unit: string,
  floating = 2
) => {
  let prefix = "";
  if (amount > 0 && amount < 0.01) {
    amount = 0.01;
    prefix = `< `;
  }

  if (unit === "sat" || unit === "sats") {
    return `${prefix}${numberWithSpaces(amount)} sats`;
  } else if (!unit) {
    return `${prefix}${amount}`
  }

  return `${prefix}${Intl.NumberFormat(undefined, {
    style: "currency",
    currency: unit,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: floating,
    maximumFractionDigits: floating
  }).format(amount)}`;
};
