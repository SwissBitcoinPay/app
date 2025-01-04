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

const TEST_AMOUNT = 123;

export const getUnitPrefixAndSuffix = (unit: string) => {
  let unitPrefix: string | undefined;
  let unitSuffix: string | undefined;

  const testFormattedUnit = getFormattedUnit(TEST_AMOUNT, unit, 0);

  if (/^[0-9]/.test(testFormattedUnit)) {
    unitSuffix = testFormattedUnit.replace(TEST_AMOUNT.toString(), "");
  } else {
    unitPrefix = testFormattedUnit.replace(TEST_AMOUNT.toString(), "");
  }

  return { unitPrefix, unitSuffix };
};

export const decimalSeparator = Intl.NumberFormat(undefined)
  .formatToParts(1.1)
  .find((part) => part.type === "decimal").value;

// Used for keyboard input on web
export const decimalSeparatorNameMapping = {
  Comma: ",",
  Period: "."
};
