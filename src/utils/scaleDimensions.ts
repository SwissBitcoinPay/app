export const scaleDimensions = (width, height, maxWidth, maxHeight) => {
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;

  const scaleRatio = Math.min(widthRatio, heightRatio, 1);

  const scaledWidth = Math.round(width * scaleRatio);
  const scaledHeight = Math.round(height * scaleRatio);

  return { width: scaledWidth, height: scaledHeight };
};
