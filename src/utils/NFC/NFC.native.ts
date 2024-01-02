import { platform } from "@config";
import NfcManager, {
  NfcEvents,
  Ndef,
  TagEvent
} from "react-native-nfc-manager";

const {isIos} = platform;

void NfcManager.start();

export const NFC = {
  init: () => {},
  startRead: async (onRead: (message: string) => void) => {
    if (isIos) {
    NfcManager.getBackgroundNdef().then((v) => {
       onRead(
          Ndef.uri.decodePayload(
            v?.[0]?.payload as unknown as Uint8Array
          )
        );
    });
  } else {
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
    }
  },
  stopRead: async () => {
    await NfcManager.cancelTechnologyRequest();
  }
};
