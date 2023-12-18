let NFC = {
  init: async () => {},
  startRead: async (_onRead: (message: string) => void | Promise<void>) => {},
  stopRead: async () => {}
};

if ("NDEFReader" in window) {
  const ndef = new NDEFReader();

  NFC = {
    init: async () => await ndef.scan(),
    // eslint-disable-next-line @typescript-eslint/require-await
    startRead: async (onRead) => {
      ndef.onreadingerror = () => {
        // TODO error message
      };

      ndef.onreading = (event) => {
        for (const record of event.message.records) {
          switch (record.recordType) {
            case "text":
            case "url":
              onRead(
                new TextDecoder(
                  record.recordType === "text" ? record.encoding : undefined
                ).decode(record.data)
              );
          }
        }
      };
    },
    stopRead: async () => new Promise<void>((r) => r())
  };
}

export { NFC };
