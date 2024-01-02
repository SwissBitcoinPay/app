import { platform } from "@config";
import NfcManager, {
  NfcEvents,
  NfcTech,
  Ndef,
  TagEvent
} from "react-native-nfc-manager";

const { isIos } = platform;

void NfcManager.start();

export const NFC = {
  init: async () => {},
  startRead: async (onRead: (message: string) => void) => {
    try {
      console.log("start read 1");

      try {
        await NfcManager.requestTechnology([NfcTech.Ndef]);
      } catch (e) {
        console.log("catch", e);
      }
      console.log("start read 2");

      const tag = await NfcManager.getTag();

      onRead(
        Ndef.uri.decodePayload(
          tag?.ndefMessage[0].payload as unknown as Uint8Array
        )
      );

      if (isIos) {
        await NfcManager.setAlertMessageIOS("Success");
      }
    } catch (e) {
      console.log("error", e);
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
    //

    //   if (isIos) {
    //   NfcManager.getBackgroundNdef().then((v) => {
    //      onRead(
    //         Ndef.uri.decodePayload(
    //           v?.[0]?.payload as unknown as Uint8Array
    //         )
    //       );
    //   });
    // } else {
    //   NfcManager.setEventListener(
    //     NfcEvents.DiscoverTag,
    //     async (tag: TagEvent) => {
    //       await NfcManager.unregisterTagEvent();
    //       onRead(
    //         Ndef.uri.decodePayload(
    //           tag?.ndefMessage?.[0]?.payload as unknown as Uint8Array
    //         )
    //       );
    //       NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    //     }
    //   );
    //   await NfcManager.registerTagEvent();
    //   }
  },
  stopRead: async () => {
    await NfcManager.cancelTechnologyRequest();
  }
};
