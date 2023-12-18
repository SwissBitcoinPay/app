export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [
    "0",
    "0",
    "0"
  ];

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return {
    r,
    g,
    b,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    formatted: `${r}, ${g}, ${b}` as `${number}, ${number}, ${number}`
  };
};
