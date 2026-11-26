// The Breez SDK is a native (Rust/JSI) module: it cannot load under Jest. Fakes of what the app
// uses, with the shapes of the 0.28.4 typings, in jest/.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("@breeztech/breez-sdk-spark-react-native", () => require("./jest/breez-sdk"));
jest.mock("@breeztech/breez-sdk-spark-react-native/passkey-prf-provider", () =>
  require("./jest/breez-passkey-prf-provider")
);
/* eslint-enable @typescript-eslint/no-require-imports */

// Reanimated runs its worklets through react-native-worklets, a native module: its Jest mock
// (https://docs.swmansion.com/react-native-worklets/docs/guides/testing).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));

// Native keyboard tracking: its own Jest mock (no keyboard, plain views).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest")
);
/* eslint-enable @typescript-eslint/no-require-imports */

// App sandbox directories as file:// URIs like on a device, over an in-memory file system.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-file-system", () => require("./jest/expo-file-system"));

// The point of sale's profile (src/lib/terminal/profile.ts): in memory, emptied before each test
// (jest.after-env.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-secure-store", () => require("./jest/expo-secure-store"));

// What the v2 app left in the keychain (src/lib/legacy-v2/store.ts): in memory
// (jest/react-native-keychain.ts), emptied before each test (jest.after-env.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-keychain", () => require("./jest/react-native-keychain"));

// The root view's colour, the theme's canvas (src/features/appearance/surroundings.ts): in memory.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-system-ui", () => require("./jest/expo-system-ui"));

// An invoice's PDF (src/features/invoices/pdf.ts): printed and shared files, in memory.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("expo-print", () => require("./jest/expo-print"));
jest.mock("expo-sharing", () => require("./jest/expo-sharing"));
/* eslint-enable @typescript-eslint/no-require-imports */

// "Contact support" (src/features/support/mail.ts): the mails composed, in memory.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-mail-composer", () => require("./jest/expo-mail-composer"));

// The due date's picker of "New invoice" (src/features/invoices/DueDateField.tsx).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("@react-native-community/datetimepicker", () => require("./jest/datetimepicker"));

// The camera of the invitation scanner (src/features/team/InviteScanner.tsx).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-camera", () => require("./jest/expo-camera"));

// "Where to pay with your card"'s map (src/features/card/MerchantMap.tsx): a plain view whose page
// tests play.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-webview", () => require("./jest/react-native-webview"));

// The push token of card payments (src/features/card/push.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-notifications", () => require("./jest/expo-notifications"));

// The card socket's task (Android, src/features/card/wake-task.android.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-task-manager", () => require("./jest/expo-task-manager"));

// The beep of a barcode read (src/features/catalog/scan-beep.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-audio", () => require("./jest/expo-audio"));

// The device's biometrics for the app's own lock (src/features/app-lock/biometrics.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-local-authentication", () => require("./jest/expo-local-authentication"));

// Screen capture blocked while the recovery phrase shows (src/features/settings/screen-shield.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-screen-capture", () => require("./jest/expo-screen-capture"));

// Expo Observe (src/lib/observe/): what the app gives it, as it records it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-observe", () => require("./jest/expo-observe"));

// The app's own module that opens a field's keyboard once its window has the focus (Android,
// src/components/ui/soft-keyboard.ts): the fields asked for, with React tags for the TextInputs.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded before the test's modules
require("./jest/soft-keyboard").installSoftKeyboard();

// The focus and the selection the app sets on its fields (TextField's handle): recorded, each
// field's own (jest/text-input.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded before the test's modules
require("./jest/text-input").installTextInput();

// The app's own module that crossfades a change of theme (the apps,
// src/features/appearance/crossfade.ts): what it was asked (jest/theme-crossfade.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded before the test's modules
require("./jest/theme-crossfade").installThemeCrossfade();

// The app's own card socket module (Android, src/lib/card/card-socket.ts): its state, and its
// service's connections to the fake card relays (jest/card-socket.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded before the test's modules
require("./jest/card-socket").installCardSocket();

// jail-monkey, which reads signs of a modified system (Android, src/lib/device-integrity.ts): a
// phone neither rooted nor hooked unless a test says so (jest/jail-monkey.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("jail-monkey", () => require("./jest/jail-monkey"));

// Device locale used by i18n, number formatting and currency detection.
jest.mock("expo-localization", () => ({
  getLocales: () => [
    {
      languageTag: "en-CH",
      languageCode: "en",
      regionCode: "CH",
      currencyCode: "CHF"
    }
  ],
  getCalendars: () => [{ timeZone: "Europe/Zurich" }]
}));

// Safe-area insets without a native provider.
jest.mock(
  "react-native-safe-area-context",
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native-safe-area-context/jest/mock").default
);

// Nostr relays (src/lib/nostr/relay.ts): in memory (jest/nostr-relays.ts). nostr-relay.test.ts tests
// the real client over a fake WebSocket.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("./src/lib/nostr/relay", () => require("./jest/nostr-relays"));

// The Bitcoin chain as mempool.space and Blockstream show it: in memory (jest/mempool.ts).
// onchain.test.ts and mempool-socket.test.ts test the real clients.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("./src/lib/onchain/esplora", () => require("./jest/mempool"));
// When BlockCypher received each transaction of that chain (blockcypher.test.ts tests the client).
jest.mock("./src/lib/onchain/blockcypher", () => ({
  fetchTxReceived: require("./jest/mempool").fetchTxReceived,
  fetchTxDetails: require("./jest/mempool").fetchTxDetails,
  resetReceivedTimes: require("./jest/mempool").resetReceivedTimes
}));
// When mempool.space first saw each transaction of that chain (mempool-times.test.ts tests the
// client).
jest.mock("./src/lib/onchain/mempool-times", () => ({
  fetchFirstSeen: require("./jest/mempool").fetchFirstSeen,
  resetFirstSeen: require("./jest/mempool").resetFirstSeen
}));
// What each address holds on that chain (legacy-v2-wallet.test.ts tests the client).
jest.mock("./src/lib/onchain/address-coins", () => ({
  fetchAddressCoins: require("./jest/mempool").fetchAddressCoins
}));
// The transactions broadcast to that chain's mempool.space (onchain-broadcast.test.ts tests the
// client).
jest.mock("./src/lib/onchain/broadcast", () => ({
  broadcastTransaction: require("./jest/mempool").broadcastTransaction,
  broadcastPackage: require("./jest/mempool").broadcastPackage
}));
// mempool.space's history of the replacements of that chain (mempool-rbf.test.ts tests the client).
jest.mock("./src/lib/onchain/mempool-rbf", () => ({
  fetchReplacedTxids: require("./jest/mempool").fetchReplacedTxids
}));
// The Lightning nodes' aliases as mempool.space tells them (node-alias.test.ts tests the client).
jest.mock("./src/lib/lightning/node-alias", () => require("./jest/node-aliases"));
jest.mock("./src/lib/onchain/mempool-socket", () => ({
  ...jest.requireActual("./src/lib/onchain/mempool-socket"),
  watchAddress: require("./jest/mempool").watchAddress
}));
/* eslint-enable @typescript-eslint/no-require-imports */

// Mt Pelerin's API (src/lib/mtpelerin/transport.ts): in memory (jest/mtpelerin.ts), started
// afresh before each test.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("./src/lib/mtpelerin/transport", () => require("./jest/mtpelerin"));

// Secure random bytes (src/lib/random.ts): Node's crypto, as expo-crypto's own Jest mock writes
// nothing.
jest.mock("expo-crypto", () => ({
  getRandomValues: (array: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(array)
}));

// Tests never reach the network: API calls fail unless a test mocks them, but those to the fake
// card relays a test added (jest/card-relay.ts, `addRelay`) and to the fake CoinGecko, which
// prices nothing until a test sets its prices (jest/coingecko.ts).
globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
  // CoinGecko's rates (jest/coingecko.ts), the fake v2 server (jest/legacy-v2-server.ts) and its
  // LNURL-withdraw service (jest/legacy-card-server.ts), then the card relays.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on use, as the mocks above
  const rates = (require("./jest/coingecko") as typeof import("./jest/coingecko")).tryFetch(input);
  if (rates) return rates;
  // The fake v2 server's account and auth routes (jest/legacy-v2-server.ts).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on use, as the mocks above
  const v2 = (
    require("./jest/legacy-v2-server") as typeof import("./jest/legacy-v2-server")
  ).tryFetch(input, init);
  if (v2) return v2;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on use, as the mocks above
  const legacy = (
    require("./jest/legacy-card-server") as typeof import("./jest/legacy-card-server")
  ).tryFetch(input, init);
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on use, as the mocks above
  return (
    legacy ??
    (require("./jest/card-relay") as typeof import("./jest/card-relay")).fetchRelays(input, init)
  );
});
// Nor do WebSockets (Node's would connect): only the phone's sessions on those fake relays open,
// anything else fails as with no network. Tests of other clients give theirs (`createSocket`).
Object.defineProperty(globalThis, "WebSocket", {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
  value: (require("./jest/card-relay") as typeof import("./jest/card-relay")).FakeRelaySocket,
  configurable: true,
  writable: true
});
