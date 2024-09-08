export const numberWithSpaces = (nb: number) =>
  nb.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
