import type { ConfigContext, ExpoConfig } from "expo/config";

import { version } from "./package.json";
// A type only: Expo evaluates this file alone, it cannot import another TypeScript file's values.
import type { CardNotificationExtensionProps } from "./plugins/card-notification-extension/app.plugin";

/**
 * Single source of truth for the native app configuration.
 *
 * The variant is selected with the APP_VARIANT environment variable:
 * - EAS Build sets it per build profile (see eas.json);
 * - the staging deploy workflow sets it for `eas update` / fingerprinting;
 * - it defaults to "staging" (local development, tests, web export), so that
 *   nothing ever resolves to production unless explicitly asked for.
 *
 * SECURITY: production binaries are built with expo-updates DISABLED and with
 * no update URL, so no over-the-air JavaScript can ever reach production users,
 * even if the Expo account or a CI token is compromised. Production changes
 * only ship through the app stores.
 */

const EAS_PROJECT_ID = "2a9acf4d-b234-4e38-8cbc-def87ce06491";
const EAS_OWNER = "swiss-bitcoin-pay";
const APP_ID = "ch.swissbitcoinpay.checkout";
// Both variants show the same name: the staging app is told apart by its dark icon.
const APP_NAME = "sattle.me";

/**
 * Lowest OS versions the stores offer the app to: the wallet is derived
 * from a passkey with the PRF extension, which the Breez SDK passkey provider only supports from
 * iOS 18 and Android 9 (API 28, with Google Play services). Devices below keep v2.
 */
const IOS_DEPLOYMENT_TARGET = "18.0";

/**
 * iOS camera usage description: expo-camera's and expo-image-picker's plugins both write it. It
 * names every use of the camera (App Review, guideline 5.1.1): the QR codes, the articles' barcodes
 * ("Items" and the point of sale's scan) and the articles' photos.
 */
const CAMERA_USAGE =
  "sattle.me uses the camera to scan QR codes (an invoice or an address to pay, a team invitation) and your articles' barcodes, and to take your articles' photos.";
const ANDROID_MIN_SDK = 28;

/**
 * iOS Face ID usage description (App Review, guideline 5.1.1): the app's own lock, "Ask for
 * biometrics to unlock the app" (src/features/app-lock/).
 * expo-local-authentication's and expo-secure-store's plugins both write it: the same text,
 * whichever runs last.
 */
const FACE_ID_USAGE =
  "sattle.me uses Face ID to unlock the app when you open it, if you turn this on in its settings.";

/**
 * iOS location usage description (App Review, guideline 5.1.1), "Where to pay with your card"
 * (src/features/card/MerchantMap.tsx): BTC Map's map, in a WebView, asks for the position only
 * when its "locate" button is tapped, and WKWebView needs this key to ask at all.
 * While the app is in use only: no "always" key, no background location (`blockedPermissions`).
 */
/**
 * iOS's "Local Network" prompt (iOS 14+, NSLocalNetworkUsageDescription): the merchant's own
 * Bitcoin node, which a basic Umbrel serves on the local network ("Bitcoin node",
 * src/lib/onchain/node.ts). The app reaches no other device of the
 * network. Apple asks every app that uses the local network to say why.
 */
const LOCAL_NETWORK_USAGE =
  "sattle.me connects to your own Bitcoin node on your local network, when you name it in Network > Bitcoin node, to follow your on-chain payments.";

const LOCATION_USAGE =
  'sattle.me uses your location only when you ask the "Where to pay with your card" map (BTC Map) to show the merchants near you that accept your BoltCard. The map, btcmap.org, receives it; sattle.me does not keep it.';

/**
 * Android's location permissions, for the same map: its WebView asks for the precise one
 * (react-native-webview 14.0.1), which Android 12+ only asks the user for when the approximate one
 * is declared too (Android's "Request location permissions", and its permission controller's
 * LocationGrantBehavior: precise or approximate offered).
 */
const LOCATION_PERMISSIONS = [
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION"
];

/**
 * The host of the link printed on the v2 cards (`https://sbpc.ch/<number>`: the card's printed
 * number), whose links every variant claims: the app opens on that card, or "Add a card"
 * (src/lib/card/legacy-link.ts). The same as LEGACY_CARD_LINK_HOST (src/config/card.ts, which this
 * file cannot import; app-config.test.ts). The host serves the association files, which say the
 * apps it opens; until it does, its links open in the browser as before.
 */
const LEGACY_CARD_LINK_HOST = "sbpc.ch";

/**
 * The paths of LEGACY_CARD_LINK_HOST the Android app opens: a printed number, four groups of four
 * characters (`pathPattern`: "a period matches any single character", Android's <data> element;
 * not `pathAdvancedPattern`, which Android 12 and later only apply), the app checking it exactly.
 */
const LEGACY_CARD_LINK_PATH = "/....-....-....-....";

/**
 * Export compliance answer (Info.plist `ITSAppUsesNonExemptEncryption`): only exempt encryption,
 * as v2 declares (SwissBitcoinPay/app, ios/SwissBitcoinPay/Info.plist). Set here, EAS CLI does
 * not ask: answering its question makes EAS CLI write
 * the answer into the config with its own @expo/config (55.0.10 in eas-cli 24.8.0), which cannot
 * load this project's TypeScript config plugins, and the build stops.
 */
const IOS_USES_NON_EXEMPT_ENCRYPTION = false;

/**
 * The app's own privacy manifest (PrivacyInfo.xcprivacy, written by prebuild): a reason for each
 * category of Apple's "required reason" APIs that the binary links. App Store Connect refuses an
 * upload whose binary uses one without a reason in a privacy manifest (since 1 May 2024, Apple's
 * "Describing use of required reason API"), and Apple does not read every manifest of the static
 * CocoaPods libraries (Expo's "Privacy manifests" guide), so the app states them itself:
 * - user defaults (CA92.1, the app's own): Expo's modules and React Native (their manifests);
 * - file timestamps (C617.1, files of the app's container): React Native, expo-application,
 *   expo-file-system (their manifests) and the Breez SDK's static library (`stat`, `fstat`,
 *   `lstat`), which ships no manifest;
 * - system boot time (35F9.1, time elapsed between the app's events): React Native (its manifests);
 * - disk space (E174.1, room to write files): expo-file-system (its manifest) and the Breez SDK's
 *   static library (`statfs`, `fstatfs`). The app shows no disk space (85F4.1).
 * Never a reason Apple keeps for third-party SDKs (0A2A.1, C56D.1). No tracking, no tracking
 * domain: the app has no advertising nor tracking SDK.
 */
const IOS_PRIVACY_MANIFEST: NonNullable<ExpoConfig["ios"]>["privacyManifests"] = {
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
      NSPrivacyAccessedAPITypeReasons: ["CA92.1"]
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
      NSPrivacyAccessedAPITypeReasons: ["C617.1"]
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
      NSPrivacyAccessedAPITypeReasons: ["35F9.1"]
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
      NSPrivacyAccessedAPITypeReasons: ["E174.1"]
    }
  ],
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: []
};

/**
 * The iOS notification service extension (plugins/card-notification-extension): its target, its
 * bundle identifier (Apple: the app's, then a suffix) and the app group it shares with the app, a
 * container and a keychain access group. The app group is IRREVERSIBLE once a build holds data
 * there (the test wallet's seed, later the cards'): never rename it.
 */
export function cardNotificationExtension(appId: string): CardNotificationExtensionProps {
  const targetName = "CardNotificationService";
  return {
    targetName,
    bundleIdentifier: `${appId}.${targetName}`,
    appGroup: `group.${appId}.cards`,
    deploymentTarget: IOS_DEPLOYMENT_TARGET
  };
}

const APP_VARIANTS = ["staging", "production"] as const;
type AppVariant = (typeof APP_VARIANTS)[number];

function getAppVariant(): AppVariant {
  const value = process.env.APP_VARIANT ?? "staging";
  if (!(APP_VARIANTS as readonly string[]).includes(value)) {
    throw new Error(`Invalid APP_VARIANT "${value}". Expected one of: ${APP_VARIANTS.join(", ")}.`);
  }
  return value as AppVariant;
}

/**
 * Android versionCode / iOS buildNumber derived from the semver version:
 * MAJOR * 1_000_000 + MINOR * 1_000 + PATCH (3.0.0 -> 3000000).
 *
 * This app replaces v2 of ch.swissbitcoinpay.checkout on the stores. v2 build
 * numbers are in the hundreds (2.7.5 = 485 for the AAB, 485001-485004 for the
 * per-ABI APKs), so every 3.x.y value is above them and installs as an update.
 */
export function getBuildNumber(semver: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!match) {
    throw new Error(`Version "${semver}" must be MAJOR.MINOR.PATCH (no pre-release suffix).`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 999 || patch > 999) {
    throw new Error(`Version "${semver}": MINOR and PATCH must be <= 999.`);
  }
  return major * 1_000_000 + minor * 1_000 + patch;
}

type VariantConfig = {
  appId: string;
  /**
   * The iOS notification service extension (plugins/card-notification-extension): it pays a card's
   * tap with the app closed and tells its outcome (docs/ios-card-payments.md). Its Apple
   * identifiers (the extension's App ID, the app group, cardNotificationExtension) exist for both
   * variants; its test (src/lib/card/probe-store.ts) runs in staging only.
   */
  cardExtension: boolean;
  scheme: string;
  icon: string;
  /**
   * The "s." of the icon on a transparent background, through which `adaptiveIconBackground`
   * shows: in ink and orange on production's white, in white and orange on staging's ink (the
   * brand kit's dark icon), where an ink "s" would vanish.
   */
  adaptiveIconForeground: string;
  adaptiveIconBackground: string;
  /** The web app's tab icon: the variant's icon, on a tile with rounded corners. */
  favicon: string;
  /**
   * Read at runtime by src/lib/breez/config.ts, which lists the supported values. Part of the
   * native fingerprint (`extra` is hashed): changing it starts a new EAS staging build.
   */
  breezNetwork: "mainnet" | "regtest";
  updates: ExpoConfig["updates"];
  runtimeVersion?: ExpoConfig["runtimeVersion"];
};

/** A label of a domain name: letters, digits and inner hyphens, 63 characters at most. */
const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Relying Party ID of the passkeys from the PASSKEY_RP_ID environment variable: a bare,
 * lowercase domain name, or undefined when the variable is not set. Throws on
 * anything else (a URL, a port, uppercase letters, an IP address), never fixes it silently.
 */
export function parsePasskeyRpId(value: string | undefined): string | undefined {
  const rpId = value?.trim();
  if (!rpId) return undefined;
  const labels = rpId.split(".");
  if (
    rpId.length > 253 ||
    labels.length < 2 ||
    !labels.every((label) => DOMAIN_LABEL.test(label)) ||
    /^[0-9]+$/.test(labels[labels.length - 1])
  ) {
    throw new Error(
      `PASSKEY_RP_ID "${rpId}" is not a domain name. Expected a bare, lowercase host such as ` +
        `"passkeys.example.com": no scheme, port, path or trailing dot.`
    );
  }
  return rpId;
}

/**
 * Relying Party ID of the passkeys of this build, read at runtime by src/lib/breez/passkey.ts:
 * PASSKEY_RP_ID, from the EAS environment of the build (`preview` for staging, `production`) or a
 * local .env.local (see .env.example). The wallet seed is derived from a passkey bound to this
 * domain: changing it gives every user of the variant another, empty wallet. DEFINITIVE once a
 * variant has users. The association files must be served on this
 * very host, as Apple and Android require.
 *
 * Unset, the app starts but refuses passkeys (`notConfigured`), like a build without a Breez API
 * key: local development, CI. Never on EAS Build, where a build without it would be useless.
 */
function getPasskeyRpId(): string | undefined {
  const rpId = parsePasskeyRpId(process.env.PASSKEY_RP_ID);
  // EAS_BUILD=true on EAS Build workers, local builds included (Expo docs, "Built-in environment
  // variables"). Any value counts: this is a safety check.
  if (!rpId && process.env.EAS_BUILD) {
    throw new Error("PASSKEY_RP_ID is not set: add it to the EAS environment of this build.");
  }
  return rpId;
}

/**
 * The config without its plugins, for EAS CLI in the GitHub jobs that hold an Expo token and run
 * none of the project's packages (the web app's deploy on EAS Hosting). `eas env:pull` and
 * `eas deploy` evaluate the config with its plugins (EAS CLI 24.8.0: `getPrivateExpoConfigAsync`,
 * without `skipPlugins`), which are the project's packages, only to read the project's id; without
 * node_modules they fail ("Failed to resolve plugin"). APP_CONFIG_WITHOUT_PLUGINS=1 leaves the
 * plugins out, in a GitHub Actions job only: anywhere else (EAS Build or its other jobs, a local
 * build, Expo CLI), a config without its plugins would make another app, so it is refused.
 */
function withoutPlugins(): boolean {
  const value = process.env.APP_CONFIG_WITHOUT_PLUGINS;
  if (value === undefined || value === "") return false;
  if (value !== "1" || process.env.GITHUB_ACTIONS !== "true" || process.env.EAS_BUILD) {
    throw new Error("APP_CONFIG_WITHOUT_PLUGINS=1 is for the GitHub jobs that run EAS CLI only.");
  }
  return true;
}

const updatesUrl = `https://u.expo.dev/${EAS_PROJECT_ID}`;

const VARIANTS: Record<AppVariant, VariantConfig> = {
  staging: {
    appId: `${APP_ID}.staging`,
    cardExtension: true,
    scheme: "sattleme-staging",
    icon: "./assets/images/icon-staging.png",
    adaptiveIconForeground: "./assets/images/adaptive-icon-foreground-staging.png",
    adaptiveIconBackground: "#0B1A33",
    favicon: "./assets/images/favicon-staging.png",
    // Mainnet too: staging wallets hold real sats, small amounts only.
    // Signet does not work with the SDK's connect() (Breez SDK 0.28.4 needs a custom Spark
    // config and chain service for it), and regtest has no developed Lightning network (Breez
    // docs).
    breezNetwork: "mainnet",
    updates: {
      enabled: true,
      url: updatesUrl,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      // EAS Build injects the channel from eas.json; this header makes locally
      // built staging binaries follow the same channel.
      requestHeaders: { "expo-channel-name": "staging" }
    },
    runtimeVersion: { policy: "fingerprint" }
  },
  production: {
    appId: APP_ID,
    cardExtension: true,
    scheme: "sattleme",
    icon: "./assets/images/icon.png",
    adaptiveIconForeground: "./assets/images/adaptive-icon-foreground.png",
    adaptiveIconBackground: "#FFFFFF",
    favicon: "./assets/images/favicon.png",
    breezNetwork: "mainnet",
    // See the SECURITY note at the top of this file.
    updates: { enabled: false }
  }
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = getAppVariant();
  const v = VARIANTS[variant];
  const buildNumber = getBuildNumber(version);
  const passkeyRpId = getPasskeyRpId();
  // Every variant's web app is served on the host of its passkeys' RP ID (staging: the project's
  // EAS Hosting domain, set on expo.dev, never written in the repository; production: its custom
  // domain): no other origin to declare for its passkeys. Its links open in the app itself, every
  // path (iOS universal links, Android App Links): a team invitation, a
  // payment link, any screen; and the app's payment links start with its origin
  // (`extra.webAppOrigin`, src/config/payment-links.ts). The web app serves the association files,
  // written at deploy time by scripts/passkey-association.js. Without an RP ID (local, CI), no web
  // app.
  const linkHost = passkeyRpId;
  const associatedDomains = [
    ...(passkeyRpId ? [`webcredentials:${passkeyRpId}`] : []),
    ...(linkHost ? [`applinks:${linkHost}`] : []),
    `applinks:${LEGACY_CARD_LINK_HOST}`
  ];
  const cardExtension = v.cardExtension ? cardNotificationExtension(v.appId) : undefined;

  const appConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: "swiss-bitcoin-pay",
    owner: EAS_OWNER,
    version,
    scheme: v.scheme,
    orientation: "portrait",
    icon: v.icon,
    // Light and dark: the app follows the device's setting, or the
    // theme chosen in "Settings › Display", which it applies to the system's own parts too
    // (keyboard, dialogs: src/features/appearance/scheme-override.ts). Android needs expo-system-ui
    // for it.
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: v.appId,
      buildNumber: String(buildNumber),
      deploymentTarget: IOS_DEPLOYMENT_TARGET,
      // v2 is a universal app: an update cannot drop iPad support on the App Store.
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: IOS_USES_NON_EXEMPT_ENCRYPTION,
        NSLocationWhenInUseUsageDescription: LOCATION_USAGE,
        // App Transport Security: HTTPS everywhere but local addresses (IP addresses, `.local`
        // names), as Expo's template has it (SDK 58's prebuild): written
        // here so that it never depends on it. The app's own code asks the merchant's node over
        // HTTPS only (src/lib/onchain/node.ts), the local network's included.
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
        NSLocalNetworkUsageDescription: LOCAL_NETWORK_USAGE
      },
      privacyManifests: IOS_PRIVACY_MANIFEST,
      // Passkeys of the RP domain, and links of the web app's host: their
      // apple-app-site-association lists this app (scripts/passkey-association.js on staging,
      // where both are that host). And the links printed on the v2 cards, whose host lists it.
      associatedDomains
    },
    android: {
      package: v.appId,
      versionCode: buildNumber,
      adaptiveIcon: {
        foregroundImage: v.adaptiveIconForeground,
        backgroundColor: v.adaptiveIconBackground
      },
      predictiveBackGestureEnabled: false,
      // No backup of the app's data to Google Drive: Android's default is to back it up. What a new phone needs comes back from the
      // passkey and the relays; the wallets' databases, the cards' records and the secure store
      // never leave the device. expo-secure-store's rules (its plugin, below) still limit a
      // device-to-device transfer, which this flag does not turn off on Android 12+ ("Back up user
      // data with Auto Backup", developer.android.com): its app preferences only, never its own.
      allowBackup: false,
      // expo-screen-capture (the recovery phrase) declares
      // READ_MEDIA_IMAGES for Android 13, which only its screenshot listener uses (never used
      // here, it checks the permission before reading anything): blocked, Google Play restricts
      // access to photos to apps whose core use needs it. Its DETECT_SCREEN_CAPTURE (Android 14+,
      // granted at install) stays: the module registers its capture callback at start-up, which
      // throws without it. The position in the background too: "Where to pay with your card"'s map asks for it
      // while it shows only (LOCATION_PERMISSIONS), and no library may add it. Drawing over other
      // apps (SYSTEM_ALERT_WINDOW), one of the "optional permissions" of Expo's template, which
      // prebuild keeps: the app never does it.
      permissions: LOCATION_PERMISSIONS,
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.SYSTEM_ALERT_WINDOW"
      ],
      // App Links of the web app's host, every path, verified with its assetlinks.json: its
      // links open in the app when it is installed, in the browser otherwise. And those printed
      // on the v2 cards, verified with their host's. Android 11 and lower verify the app's hosts
      // all together ("only if it finds a matching Digital Asset Links file for all hosts in the
      // manifest", Android's "Verify Android App Links"): until the cards' host lists this
      // variant, its web app's host is not verified there either.
      intentFilters: [
        ...(linkHost
          ? [
              {
                action: "VIEW",
                autoVerify: true,
                data: [{ scheme: "https", host: linkHost }],
                category: ["BROWSABLE", "DEFAULT"]
              }
            ]
          : []),
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: LEGACY_CARD_LINK_HOST, pathPattern: LEGACY_CARD_LINK_PATH }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      // Single-page app: wallet code must never be rendered on a server.
      output: "single",
      favicon: v.favicon
    },
    plugins: [
      // The web app split by route (async routes, Expo SDK 58's default): a screen's code is
      // fetched when it is first opened.
      ["expo-router", { asyncRoutes: { web: true } }],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#FFFFFF",
          // A device in dark mode: the dark theme's canvas (src/theme/tokens.ts), the logo in its
          // light tone (white "sattle"). The device's mode, not the app's "Theme": the splash
          // screen shows before the app's code can read it.
          dark: { backgroundColor: "#0B1A33" },
          // Android masks the splash icon to its middle: a PNG sized with imageWidth showed the
          // logo cut off at both ends. This vector drawable (the paths of logo.svg) is the whole
          // 288 dp icon square, the logo centred where no mask clips it.
          android: {
            drawable: {
              icon: "./assets/images/splash-logo-android.xml",
              darkIcon: "./assets/images/splash-logo-android-dark.xml"
            }
          },
          // The plugin only takes a raster image on iOS, which shows it whole.
          ios: {
            image: "./assets/images/splash-logo.png",
            imageWidth: 288,
            dark: { image: "./assets/images/splash-logo-dark.png" }
          }
        }
      ],
      // No `enablePasskey` option: it only adds the Breez shared RP (keys.breez.technology),
      // this app uses its own (`ios.associatedDomains` above).
      "@breeztech/breez-sdk-spark-react-native",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: ANDROID_MIN_SDK,
            // R8, on by default in release builds since Expo SDK 58: off, as before, until a release
            // build with it is tried on devices. Some
            // classes are loaded by their name at run time (the card socket's task consumer, which
            // expo-task-manager starts again by its name, the app closed), which it may rename or
            // drop; and Expo Observe cannot read a renamed stack yet (no upload of R8's mapping).
            // No `usesCleartextTraffic`: Android 9+ refuses every unencrypted request of the app's
            // Java/Kotlin stack (fetch, WebSocket, the WebView). The merchant's node is asked over
            // HTTPS only (src/lib/onchain/node.ts), where the
            // Breez SDK's own client, which this rule does not bind, is pointed too.
            enableMinifyInReleaseBuilds: false
          }
        }
      ],
      // The point of sale's profile (src/lib/terminal/profile.ts), stored without biometrics. Its
      // plugin writes the Face ID usage description too: the app lock's (FACE_ID_USAGE), never its
      // default text nor `false`, which would remove the key the lock needs, whichever runs last.
      // Its Android backup rules (its default `configureAndroidBackup`, kept: app-config.test.ts)
      // back up the app's preferences only, never the store, whose keys could not decrypt it on
      // another device: what a device-to-device transfer still carries (`allowBackup` above).
      ["expo-secure-store", { faceIDPermission: FACE_ID_USAGE }],
      // The app's own lock (src/features/app-lock/): the system's biometrics, or the device's code.
      // Its plugin adds Android's USE_BIOMETRIC and USE_FINGERPRINT permissions.
      ["expo-local-authentication", { faceIDPermission: FACE_ID_USAGE }],
      // QR codes and barcodes, one entry for every use: an invoice or an address to pay
      // ("Send" of the wallet, src/features/wallet/send/), team invitations
      // (src/features/team/InviteScanner.tsx) and the articles' barcodes
      // (src/features/catalog/BarcodeScanner.tsx). Images only, never sound: no microphone usage
      // description on iOS (`false` removes the key) and no RECORD_AUDIO on Android.
      [
        "expo-camera",
        {
          cameraPermission: CAMERA_USAGE,
          microphonePermission: false,
          recordAudioAndroid: false
        }
      ],
      // The beep of a barcode read (src/features/catalog/scan-beep.ts): a
      // short sound played in the foreground, nothing else. Never the microphone (`false` removes
      // the iOS key, no RECORD_AUDIO), nor the playback in the background, which its plugin turns
      // on by default (iOS `UIBackgroundModes` audio, Android's foreground service and its
      // FOREGROUND_SERVICE_MEDIA_PLAYBACK permission).
      [
        "expo-audio",
        {
          microphonePermission: false,
          recordAudioAndroid: false,
          enableBackgroundPlayback: false,
          enableBackgroundRecording: false
        }
      ],
      // The business's logo and the employees' photos (src/features/media/pick-image.ts): the photo
      // library; an article's photo, from it or taken with the system's camera app. Both usage descriptions name every
      // use (App Review, guideline 5.1.1). Its plugin also writes the camera's usage description:
      // the same text as expo-camera's, whichever runs last. Never the
      // microphone (`false` removes the iOS key and blocks RECORD_AUDIO); `cameraPermission` is not
      // `false`, which would block the camera's Android permission that the QR codes and the
      // articles' photos need.
      [
        "expo-image-picker",
        {
          photosPermission:
            "sattle.me uses your photo library to pick your business's logo, your profile photo or your articles' photos.",
          cameraPermission: CAMERA_USAGE,
          microphonePermission: false
        }
      ],
      // BoltCards (NTAG 424 DNA): read at the point of sale (src/lib/nfc/, NDEF), and the user's
      // own card programmed and reset over ISO 7816 APDUs (src/lib/card/). On iOS both go through
      // NFCTagReaderSession (`requestTechnology`), which needs the `TAG` format alone: Apple lists
      // no other value, and App Store Connect refuses an app whose entitlement holds `NDEF`
      // (ITMS-90778, "NDEF is disallowed"). D2760000850101 is the NDEF application of NFC Forum
      // Type 4 tags: Core NFC only hands an ISO 7816 tag to the app when it answers one of these
      // identifiers. The usage description names both uses (App Review, guideline 5.1.1).
      [
        "react-native-nfc-manager",
        {
          nfcPermission:
            "sattle.me reads BoltCard NFC cards to take their payments, and programs your own BoltCard to pay with your wallet.",
          includeNdefEntitlement: false,
          selectIdentifiers: ["D2760000850101"]
        }
      ],
      // Card payments (src/features/card/): an iPhone gets an Expo push token, which the card relay
      // sends each payment's wake packet to: shown notifications only, no background processing,
      // no `remote-notification` background mode. Android has no push (its card socket wakes it,
      // src/features/card/socket.ts): the app's own notices only (paid-notice.ts, the card
      // socket's task). No custom sound. Android's status bar draws only the icon's alpha (96x96,
      // all white on transparent, expo-notifications docs): the "s." of the app icon (the brand
      // kit's white symbol), tinted with the brand's orange in the notification.
      [
        "expo-notifications",
        {
          enableBackgroundRemoteNotifications: false,
          icon: "./assets/images/notification-icon.png",
          color: "#F7931A"
        }
      ],
      // expo-task-manager, for the card socket's task, is linked on Android only (package.json):
      // the `fetch` background mode its own plugin adds to iOS is taken out again.
      "./plugins/no-ios-background-fetch/app.plugin",
      ...(cardExtension
        ? [
            ["./plugins/card-notification-extension/app.plugin", cardExtension] satisfies [
              string,
              CardNotificationExtensionProps
            ]
          ]
        : [])
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    updates: v.updates,
    // Always set, even to undefined: a runtimeVersion from a static config (`...config`, e.g. a
    // future app.json) must never reach production.
    runtimeVersion: v.runtimeVersion,
    extra: {
      appVariant: variant,
      breezNetwork: v.breezNetwork,
      // The app finds the container it shares with the extension by it (Paths.appleSharedContainers).
      ...(cardExtension ? { cardAppGroup: cardExtension.appGroup } : {}),
      ...(passkeyRpId ? { passkeyRpId } : {}),
      ...(linkHost ? { webAppOrigin: `https://${linkHost}` } : {}),
      eas: {
        projectId: EAS_PROJECT_ID,
        // EAS makes the extension's provisioning profile once it knows it (Expo, "App
        // extensions": needed before prebuild generates the Xcode project).
        ...(cardExtension
          ? {
              build: {
                experimental: {
                  ios: {
                    appExtensions: [
                      {
                        targetName: cardExtension.targetName,
                        bundleIdentifier: cardExtension.bundleIdentifier,
                        entitlements: {
                          "com.apple.security.application-groups": [cardExtension.appGroup]
                        }
                      }
                    ]
                  }
                }
              }
            }
          : {})
      }
    }
  };
  return withoutPlugins() ? { ...appConfig, plugins: [] } : appConfig;
};
