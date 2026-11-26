import { AppState } from "react-native";

import { resetClock } from "@/lib/clock";

import type * as BreezFake from "./jest/breez-sdk";
import type * as DatePickerFake from "./jest/datetimepicker";
import type * as AudioFake from "./jest/expo-audio";
import type * as CameraFake from "./jest/expo-camera";
import type * as MailComposerFake from "./jest/expo-mail-composer";
import type * as PrintFake from "./jest/expo-print";
import type * as SecureStoreFake from "./jest/expo-secure-store";
import type * as KeychainFake from "./jest/react-native-keychain";
import type * as SharingFake from "./jest/expo-sharing";
import type * as MempoolFake from "./jest/mempool";
import type * as WebViewFake from "./jest/react-native-webview";
import { resetCardSocket } from "./jest/card-socket";
import { resetSoftKeyboard } from "./jest/soft-keyboard";
import { resetFieldCalls } from "./jest/text-input";
import { resetThemeCrossfade } from "./jest/theme-crossfade";

// Each test starts on a device that was never prepared for the point of sale, with an empty wallet.
beforeEach(async () => {
  // No sale of an earlier test kept for its verdict, nor its follower's schedule
  // (src/features/terminal/sale-follow.ts).
  await jest
    .requireActual<typeof import("@/features/terminal/sale-follow")>(
      "./src/features/terminal/sale-follow"
    )
    .resetFollowedSales();
  // Nor a transaction this device recorded seen (src/features/onchain/useOnchainTimes.ts).
  jest
    .requireActual<typeof import("@/features/onchain/useOnchainTimes")>(
      "./src/features/onchain/useOnchainTimes"
    )
    .resetRecordedSightings();
  jest.requireMock<typeof SecureStoreFake>("expo-secure-store").resetSecureStore();
  jest.requireMock<typeof KeychainFake>("react-native-keychain").resetKeychain();
  jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native").resetFakeWallet();
  jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native").resetFakeSend();
  // What the fake v2 server accepts (jest/legacy-v2-server.ts). The migration's own memory is
  // reset by its tests (migration-*.test.tsx), the only ones that load it.
  jest
    .requireActual<typeof import("./jest/legacy-v2-server")>("./jest/legacy-v2-server")
    .resetLegacyV2Server();
  // The fake v2 LNURL-withdraw services a test registered (jest/legacy-card-server.ts).
  jest
    .requireActual<typeof import("./jest/legacy-card-server")>("./jest/legacy-card-server")
    .resetLegacyServers();
  // Required here, as the team's modules below: it loads the settings (a card holder's profile,
  // profile-cache.ts), and with them the network's config.
  jest
    .requireActual<typeof import("@/features/terminal/profile-cache")>(
      "./src/features/terminal/profile-cache"
    )
    .resetTerminalProfileCache();
  // The app in front, as on a device that shows it: React Native's AppState has no native module
  // in Jest (its state null), and the app's lock (src/features/app-lock/) asks in front only.
  (AppState as { currentState: unknown }).currentState = "active";
  // Back to the default relays: a test may have given the device a list of its own. Required here,
  // as the team's modules below: their store reads the app group (card-keychain.ts), which a test
  // file mocks (expo-constants).
  jest
    .requireActual<typeof import("@/features/relays/device-relays")>(
      "./src/features/relays/device-relays"
    )
    .resetDeviceRelays();
  // No holder of export epochs' keys of an earlier test (src/lib/nostr/epochs.ts).
  jest
    .requireActual<typeof import("@/lib/nostr/epochs")>("./src/lib/nostr/epochs")
    .resetEpochHolders();
  jest
    .requireActual<typeof import("@/features/team/export-epochs")>(
      "./src/features/team/export-epochs"
    )
    .resetExportEpochs();
  // Nor a login of an earlier test that found no account ("No account found").
  jest
    .requireActual<typeof import("@/features/account/not-found")>(
      "./src/features/account/not-found"
    )
    .clearAccountNotFound();
  // Required here, once the test file's own mocks are set (jest.mock): imported above, the team's
  // modules and those they load (the network's config, src/features/team/member-addresses.ts)
  // would keep the real modules for the whole file.
  jest
    .requireActual<typeof import("@/features/team/member")>("./src/features/team/member")
    .resetMembershipCache();
  // The owner's device's record (registered at each unlock, src/features/team/owner-device.ts),
  // the images and the relays' lights read by an earlier test: the secure store is empty again.
  jest
    .requireActual<typeof import("@/features/team/owner-device")>(
      "./src/features/team/owner-device"
    )
    .resetOwnerDeviceCache();
  jest
    .requireActual<typeof import("@/features/media/images")>("./src/features/media/images")
    .resetImages();
  // The release notes opened by an earlier test (src/features/release-notes/seen.ts): read again
  // from the secure store, empty again.
  jest
    .requireActual<typeof import("@/features/release-notes/seen")>(
      "./src/features/release-notes/seen"
    )
    .resetSeenReleaseNotesCache();
  // Nor a v2 card's visual downloaded by an earlier test (src/features/card/issuer-visual.ts).
  jest
    .requireActual<typeof import("@/features/card/issuer-visual")>(
      "./src/features/card/issuer-visual"
    )
    .resetIssuerVisuals();
  jest
    .requireActual<typeof import("@/features/relays/relay-test")>(
      "./src/features/relays/relay-test"
    )
    .resetRelayStatuses();
  // Back to the device's clock: an invoice of a test may have corrected it (src/lib/clock.ts).
  resetClock();
  // No node announces an alias but those the test names (jest/node-aliases.ts).
  jest
    .requireActual<typeof import("./jest/node-aliases")>("./jest/node-aliases")
    .resetNodeAliases();
  // No invoice printed nor shared yet, none read (src/features/invoices/).
  jest.requireMock<typeof PrintFake>("expo-print").resetPrint();
  // Notifications not allowed nor refused yet (jest/expo-notifications.ts).
  jest
    .requireMock<typeof import("./jest/expo-notifications")>("expo-notifications")
    .resetNotifications();
  // No card relay but those the test adds (jest/card-relay.ts), nor what one announced
  // (src/features/card/relay-sync.ts).
  jest.requireActual<typeof import("./jest/card-relay")>("./jest/card-relay").resetCardRelays();
  jest
    .requireActual<typeof import("@/features/card/relay-sync")>("./src/features/card/relay-sync")
    .resetRelayInfo();
  jest.requireMock<typeof SharingFake>("expo-sharing").resetSharing();
  // Nothing given to Expo Observe yet (jest/expo-observe.ts), and this device's choice of what it
  // sends back to its variant's default, as with an empty secure store (src/lib/observe/).
  jest.requireMock<typeof import("./jest/expo-observe")>("expo-observe").resetObserve();
  jest
    .requireActual<typeof import("@/lib/observe/observe")>("./src/lib/observe/observe")
    .resetObserveChoice();
  jest.requireMock<typeof MailComposerFake>("expo-mail-composer").resetMailComposer();
  // No copy round of the cards' months yet (src/features/card/history-copies.ts).
  jest
    .requireActual<typeof import("@/features/card/history-copies")>(
      "./src/features/card/history-copies"
    )
    .resetCardHistoryCopies();
  // "Ask for biometrics to unlock the app" not read yet (src/features/app-lock/preference.ts), the
  // app just opened (AppLock.tsx), the device's biometrics as the test sets them
  // (jest/expo-local-authentication.ts), nothing of the system's open over the app
  // (src/lib/system-ui.ts).
  jest
    .requireActual<typeof import("@/features/app-lock/preference")>(
      "./src/features/app-lock/preference"
    )
    .resetAppLock();
  jest
    .requireActual<typeof import("@/features/app-lock/AppLock")>("./src/features/app-lock/AppLock")
    .resetAppLockState();
  // "Currency shown first" not read yet (src/features/settings/amount-unit.ts).
  jest
    .requireActual<typeof import("@/features/settings/amount-unit")>(
      "./src/features/settings/amount-unit"
    )
    .resetAmountUnit();
  // "Theme" not read yet (src/features/appearance/theme-preference.ts), the device in its light
  // mode (React Native's own mock of useColorScheme), the root view without a colour.
  jest
    .requireActual<typeof import("@/features/appearance/theme-preference")>(
      "./src/features/appearance/theme-preference"
    )
    .resetThemePreference();
  jest
    .requireMock<{ default: jest.Mock }>("react-native/Libraries/Utilities/useColorScheme")
    .default.mockImplementation(() => "light");
  jest.requireMock<typeof import("./jest/expo-system-ui")>("expo-system-ui").resetRootBackground();
  // Nor the passkey a card holder's phone asks as the app opens (navigation/launch-unlock.ts).
  jest
    .requireActual<typeof import("@/features/navigation/launch-unlock")>(
      "./src/features/navigation/launch-unlock"
    )
    .resetLaunchUnlock();
  jest
    .requireMock<typeof import("./jest/expo-local-authentication")>("expo-local-authentication")
    .resetLocalAuthentication();
  jest.requireActual<typeof import("@/lib/system-ui")>("./src/lib/system-ui").resetSystemUi();
  // This device's NFC not asked yet (src/features/card/useReadsCards.ts): a test may remove it.
  jest
    .requireActual<typeof import("@/features/card/useReadsCards")>(
      "./src/features/card/useReadsCards"
    )
    .resetReadsCards();
  // No deleted card's wallet read yet (src/features/card/useErasedFunds.ts).
  jest
    .requireActual<typeof import("@/features/card/useErasedFunds")>(
      "./src/features/card/useErasedFunds"
    )
    .resetErasedFunds();
  // No rate known (jest/coingecko.ts), nor any read by an earlier test (src/lib/rates/sources.ts).
  jest.requireActual<typeof import("./jest/coingecko")>("./jest/coingecko").resetCoingecko();
  jest
    .requireActual<typeof import("@/lib/rates/sources")>("./src/lib/rates/sources")
    .resetRatePoints();
  // An empty journal (src/lib/log/): an earlier test's failures are not this one's.
  jest.requireActual<typeof import("@/lib/log/log")>("./src/lib/log/log").clearLog();
  jest
    .requireActual<typeof import("@/features/invoices/store")>("./src/features/invoices/store")
    .resetInvoicesStore();
  jest
    .requireActual<typeof import("@/features/invoices/rows")>("./src/features/invoices/rows")
    .resetOwnerRows();
  // A test file may replace the camera with its own mock, without `resetCamera`
  // (wallet-screen.test.tsx).
  jest.requireMock<Partial<typeof CameraFake>>("expo-camera").resetCamera?.();
  jest.requireMock<typeof AudioFake>("expo-audio").resetAudio();
  jest.requireMock<typeof WebViewFake>("react-native-webview").resetWebView();
  jest
    .requireMock<typeof import("./jest/expo-screen-capture")>("expo-screen-capture")
    .resetScreenCapture();
  resetSoftKeyboard();
  resetFieldCalls();
  // Each still of a change of theme taken at once (jest/theme-crossfade.ts).
  resetThemeCrossfade();
  // The card socket off, without tokens nor relays (jest/card-socket.ts).
  resetCardSocket();
  // A Mt Pelerin without any profile (jest/mtpelerin.ts).
  jest
    .requireMock<typeof import("./jest/mtpelerin")>("./src/lib/mtpelerin/transport")
    .resetMtPelerin();
  // A phone whose system shows no sign of a modification, read anew (jest/jail-monkey.ts).
  jest.requireMock<typeof import("./jest/jail-monkey")>("jail-monkey").resetJailMonkey();
  jest
    .requireActual<typeof import("@/lib/device-integrity")>("./src/lib/device-integrity")
    .forgetPhoneRiskSignals();
  jest.requireMock<typeof MempoolFake>("./src/lib/onchain/esplora").resetMempool();
  // No explorer known to have failed (src/features/onchain/explorer.ts).
  jest
    .requireActual<typeof import("@/features/onchain/explorer")>("./src/features/onchain/explorer")
    .resetExplorerFailures();
  jest
    .requireMock<typeof DatePickerFake>("@react-native-community/datetimepicker")
    .resetDatePicker();
});

// A device that joined a team reads its membership again 20 s later (JOIN_RECHECK_MS): that timer
// never outlives its test (after the last test of a file, it kept the worker running).
afterEach(() => {
  jest
    .requireActual<typeof import("@/features/team/member")>("./src/features/team/member")
    .resetMembershipCache();
  // Nor does a card relay's session (a minute): its timers and its sockets end with the test.
  jest.requireActual<typeof import("./jest/card-relay")>("./jest/card-relay").resetCardRelays();
  // Nor does an update of the Lightning address's name, started by an unlock or a rename
  // (src/features/terminal/address-description.ts): it connects no wallet, writes nothing.
  jest
    .requireActual<typeof import("@/features/terminal/address-description")>(
      "./src/features/terminal/address-description"
    )
    .resetAddressDescription();
});
