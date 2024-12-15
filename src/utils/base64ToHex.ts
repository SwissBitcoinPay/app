export const base64ToHex = (base64String: string) => {
  const binaryString = atob(base64String);
  const byteArray = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }

  let hexString = "";
  byteArray.forEach((byte) => {
    hexString += byte.toString(16).padStart(2, "0");
  });

  return hexString;
};
