import NfcManager, {
  NfcEvents,
  Ndef,
  TagEvent
} from "react-native-nfc-manager";

export const NFC = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  init: NfcManager.start,
  startRead: async (onRead: (message: string) => void) => {
    NfcManager.setEventListener(
      NfcEvents.DiscoverTag,
      async (tag: TagEvent) => {
        await NfcManager.unregisterTagEvent();
        onRead(
          Ndef.uri.decodePayload(
            tag?.ndefMessage?.[0]?.payload as unknown as Uint8Array
          )
        );
        NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      }
    );
    await NfcManager.registerTagEvent();
  },
  stopRead: async () => {
    await NfcManager.cancelTechnologyRequest();
  }
};
