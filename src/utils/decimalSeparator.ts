export const decimalSeparator = Intl.NumberFormat(undefined)
  .formatToParts(1.1)
  .find((part) => part.type === "decimal").value;

// Used for keyboard input on web
export const decimalSeparatorNameMapping = {
  Comma: ",",
  Period: "."
};
