import RootClipboard from "@react-native-clipboard/clipboard";

export const Clipboard = {
  setString: (stringToCopy: string) => {
    RootClipboard.setString(stringToCopy);
    return true;
  },
  isReadTextAvailable: true,
  getString: async () => await RootClipboard.getString()
};
