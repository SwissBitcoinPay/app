const readFile = async (
  _filepath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _encodingOrOptions?: any
): Promise<string> => {};

const FS = { readFile };

export { FS };
