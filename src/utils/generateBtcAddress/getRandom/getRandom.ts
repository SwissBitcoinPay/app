// eslint-disable-next-line @typescript-eslint/require-await
export const getRandom = async (count: number) => {
  if (typeof crypto?.getRandomValues === "function") {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(count)));
  }
  throw new Error("crypto.getRandomValues must be defined");
};
