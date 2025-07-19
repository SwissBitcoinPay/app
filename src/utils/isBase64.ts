export const isBase64 = (data: string) =>
  Buffer.from(data, "base64").toString("base64") === data;
