export const base64ToBitmapArray = (base64String: string) => {
  const binaryString = atob(base64String);
  const bitmapArray = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bitmapArray[i] = binaryString.charCodeAt(i);
  }

  return Array.from(bitmapArray);
};
