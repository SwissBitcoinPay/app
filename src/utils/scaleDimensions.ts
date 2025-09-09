export const scaleDimensions = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;

  const scaleRatio = Math.min(widthRatio, heightRatio, 1);

  const scaledWidth = Math.round(width * scaleRatio);
  const scaledHeight = Math.round(height * scaleRatio);

  return { width: scaledWidth, height: scaledHeight };
};
