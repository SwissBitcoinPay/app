import { Image } from "react-native";

export const getImageSize = (image: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(image, (width, height) => resolve({ width, height }), reject);
  });
