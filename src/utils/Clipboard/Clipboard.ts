export const Clipboard = {
  setString: (stringToCopy: string) => {
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(stringToCopy);
      return true;
    } else {
      console.error("The Clipboard API is not available.");
      return false;
    }
  },
  isReadTextAvailable: !!navigator?.clipboard?.readText,
  getString: async () => {
    if (navigator?.clipboard?.readText) {
      return await navigator.clipboard.readText();
    } else {
      console.error("The Clipboard API is not available.");
      return "";
    }
  }
};
