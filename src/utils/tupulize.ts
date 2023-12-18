export const tupulize = <T>(value: T | T[]) =>
  Array.isArray(value) ? value : [value];
