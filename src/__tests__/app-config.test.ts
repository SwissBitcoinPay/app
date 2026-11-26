import type { ExpoConfig } from "expo/config";
import type { Props as SplashScreenProps } from "expo-splash-screen/plugin";

import appConfig, {
  cardNotificationExtension,
  getBuildNumber,
  parsePasskeyRpId
} from "../../app.config";
import { checkProps } from "../../plugins/card-notification-extension/app.plugin";
import { withEnv } from "../../jest/env";
import { readPng } from "../../jest/png";
import { dependencies, version } from "../../package.json";
import { LEGACY_CARD_LINK_HOST } from "../config/card";
import { BREEZ_NETWORKS } from "../lib/breez/config";
import { legacyCardLinkNumber } from "../lib/card/legacy-link";
import { darkColors } from "../theme/tokens";

type StaticConfig = Parameters<typeof appConfig>[0]["config"];

// Node's types are not loaded (tsconfig `types` only lists jest), and loading them would expose
// Node APIs to app code, which runs on Hermes: only what this test needs is typed here.
declare const __dirname: string;
const { readFileSync, readdirSync, existsSync } = jest.requireActual<{
  readFileSync(file: string): Uint8Array;
  readdirSync(
    dir: string,
    options: { withFileTypes: true }
  ): { name: string; isDirectory(): boolean; isFile(): boolean }[];
  existsSync(path: string): boolean;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

/** Folders of a package that no iOS build compiles. */
const NOT_IOS = new Set(["node_modules", "android", "example", "examples", "__tests__", "web"]);

/** Every PrivacyInfo.xcprivacy that a dependency's iOS code ships, as text. */
function dependencyPrivacyManifests(name: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !NOT_IOS.has(entry.name)) walk(join(dir, entry.name));
      else if (entry.isFile() && entry.name === "PrivacyInfo.xcprivacy") {
        found.push(new TextDecoder().decode(readFileSync(join(dir, entry.name))));
      }
    }
  };
  const root = join(__dirname, "..", "..", "node_modules", name);
  if (existsSync(root)) walk(root);
  return found;
}

/** Reads an image of the app config, whose paths are relative to the project root. */
function readConfigImage(path: string | undefined) {
  if (!path) throw new Error("Image missing from the app config");
  return readPng(join(__dirname, "../..", path));
}

/**
 * The app config of a variant, outside EAS Build unless `env` says otherwise (there, a missing
 * PASSKEY_RP_ID throws): the EAS_BUILD of the shell running the tests never decides one.
 */
function resolve(
  variant: string | undefined,
  staticConfig: StaticConfig = {},
  env: Record<string, string | undefined> = {}
): ExpoConfig {
  return withEnv({ APP_VARIANT: variant, EAS_BUILD: undefined, ...env }, () =>
    appConfig({ config: staticConfig } as Parameters<typeof appConfig>[0])
  );
}

/**
 * Options of the expo-splash-screen plugin, for one variant. Typed with the plugin's own props, so
 * that a misspelt option in a `toBeUndefined()` check fails to compile instead of passing.
 */
function splashScreenOptions(variant: string): SplashScreenProps {
  const plugin = resolve(variant).plugins?.find(
    (entry) => Array.isArray(entry) && entry[0] === "expo-splash-screen"
  );
  if (!plugin) throw new Error("expo-splash-screen missing from the app config");
  return (plugin as [string, SplashScreenProps])[1];
}

/** What every variant claims of the links printed on the v2 cards (`https://sbpc.ch/<number>`). */
const PRINTED_LINKS_DOMAIN = "applinks:sbpc.ch";
const PRINTED_LINKS_FILTER = {
  action: "VIEW",
  autoVerify: true,
  data: [{ scheme: "https", host: "sbpc.ch", pathPattern: "/....-....-....-...." }],
  category: ["BROWSABLE", "DEFAULT"]
};

describe("app.config", () => {
  it("never enables over-the-air updates in production", () => {
    const config = resolve("production");

    expect(config.updates).toEqual({ enabled: false });
    expect(config.runtimeVersion).toBeUndefined();
  });

  it("drops update settings inherited from a static config (app.json) in production", () => {
    const config = resolve("production", {
      runtimeVersion: "1.0.0",
      updates: { enabled: true, url: "https://u.expo.dev/00000000-0000-0000-0000-000000000000" }
    });

    expect(config.updates).toEqual({ enabled: false });
    expect(config.runtimeVersion).toBeUndefined();
  });

  it("points staging builds at the staging update channel", () => {
    const config = resolve("staging");

    expect(config.updates?.enabled).toBe(true);
    expect(config.updates?.requestHeaders).toEqual({ "expo-channel-name": "staging" });
  });

  it("defaults to staging, never to production", () => {
    expect(resolve(undefined).android?.package).toBe("ch.swissbitcoinpay.checkout.staging");
  });

  it("gives each variant its own application id", () => {
    expect(resolve("production").android?.package).toBe("ch.swissbitcoinpay.checkout");
    expect(resolve("staging").android?.package).toBe("ch.swissbitcoinpay.checkout.staging");
  });

  // No push on Android: the card socket wakes Android phones, in both variants
  // (src/features/card/socket.ts).
  it("gives no Android variant a Google services file, and takes no card socket out", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      expect(config.android?.googleServicesFile).toBeUndefined();
      expect(JSON.stringify(config.plugins)).not.toContain("without-card-socket");
    }
  });

  it("names both variants sattle.me", () => {
    expect(resolve("production").name).toBe("sattle.me");
    expect(resolve("staging").name).toBe("sattle.me");
  });

  // Same name on both apps: the icon is what tells staging apart.
  it("gives staging a dark icon and production a white one", () => {
    const staging = resolve("staging");
    const production = resolve("production");

    // Android 8+: adaptive icon background.
    expect(staging.android?.adaptiveIcon?.backgroundColor).toBe("#0B1A33");
    expect(production.android?.adaptiveIcon?.backgroundColor).toBe("#FFFFFF");
    // iOS and Android <= 7: `icon`, whose background is in the image itself.
    expect(readConfigImage(staging.icon).rgb(0, 0)).toEqual([0x0b, 0x1a, 0x33]);
    expect(readConfigImage(production.icon).rgb(0, 0)).toEqual([0xff, 0xff, 0xff]);
  });

  // The web app's tab tells staging apart too: each favicon is its variant's icon, a tile with
  // rounded (transparent) corners in the icon's background, its "s" in the other colour.
  it("gives staging a dark favicon and production a white one", () => {
    for (const [variant, tile, letter] of [
      ["staging", [0x0b, 0x1a, 0x33], [0xff, 0xff, 0xff]],
      ["production", [0xff, 0xff, 0xff], [0x0b, 0x1a, 0x33]]
    ] as const) {
      const config = resolve(variant);
      const png = readConfigImage(config.web?.favicon);
      expect([png.width, png.height]).toEqual([48, 48]);
      expect(png.alpha(0, 0)).toBe(0);
      expect(png.rgb(4, 24)).toEqual(readConfigImage(config.icon).rgb(0, 0));
      expect(png.rgb(4, 24)).toEqual([...tile]);
      const count = (colour: readonly number[]) => {
        let pixels = 0;
        for (let y = 0; y < png.height; y++) {
          for (let x = 0; x < png.width; x++) {
            if (png.alpha(x, y) === 255 && png.rgb(x, y).join() === colour.join()) pixels++;
          }
        }
        return pixels;
      };
      // The "s" and its orange dot.
      expect(count(letter)).toBeGreaterThan(100);
      expect(count([0xf7, 0x93, 0x1a])).toBeGreaterThan(20);
    }
  });

  // A tile off the pixel grid by a fraction of a pixel shows, once the browser scales it down to a
  // tab's 16 points, a faint border of the tab's colour along its translucent edges and one corner
  // rounder than the others; translucent pixels of another colour than the tile's, a grey ring
  // around it on a white tab.
  it("draws each favicon's tile on the pixel grid: four alike corners, opaque edges", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      const png = readConfigImage(config.web?.favicon);
      const tile = readConfigImage(config.icon).rgb(0, 0);
      const last = png.width - 1;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const alpha = png.alpha(x, y);
          expect([alpha, alpha, alpha]).toEqual([
            png.alpha(last - x, y),
            png.alpha(x, last - y),
            png.alpha(y, x)
          ]);
          if (alpha > 0 && alpha < 255) expect(png.rgb(x, y)).toEqual(tile);
        }
      }
      for (const [x, y] of [
        [24, 0],
        [0, 24],
        [24, last],
        [last, 24]
      ]) {
        expect(png.alpha(x, y)).toBe(255);
      }
    }
  });

  // An opaque foreground hides the background colour, and staging then looks like production.
  it("lets the adaptive icon background colour show through the foreground", () => {
    for (const variant of ["staging", "production"]) {
      const png = readConfigImage(resolve(variant).android?.adaptiveIcon?.foregroundImage);
      expect(png.height).toBe(png.width);
      // Launchers show the inner 72dp of the 108dp layers, whatever the mask shape.
      const start = Math.round((png.width * 18) / 108);
      const end = png.width - start;
      let transparent = 0;
      for (let y = start; y < end; y++) {
        for (let x = start; x < end; x++) {
          if (png.alpha(x, y) === 0) transparent++;
        }
      }

      expect(transparent / (end - start) ** 2).toBeGreaterThan(0.5);
    }
  });

  // Each foreground draws the "s." in the colours of its background (the brand kit's light and
  // dark icons): an ink "s" would vanish on staging's ink, a white one on production's white.
  it('draws each adaptive icon\'s "s" in a colour its background shows', () => {
    for (const [variant, letter] of [
      ["staging", [0xff, 0xff, 0xff]],
      ["production", [0x0b, 0x1a, 0x33]]
    ] as const) {
      const png = readConfigImage(resolve(variant).android?.adaptiveIcon?.foregroundImage);
      const colours = new Set<string>();
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          if (png.alpha(x, y) === 255) colours.add(png.rgb(x, y).join(","));
        }
      }

      expect([...colours].sort()).toEqual([letter.join(","), "247,147,26"].sort());
    }
  });

  // Android masks its splash screen icon to the middle: a PNG as wide as `imageWidth` showed the
  // logo cut off at both ends. The vector drawable places it where no mask clips it (logo.test.ts).
  it("draws the Android splash screen logo from its vector drawable, not from an image", () => {
    for (const variant of ["staging", "production"]) {
      const options = splashScreenOptions(variant);

      expect(options.android?.drawable).toEqual({
        icon: "./assets/images/splash-logo-android.xml",
        darkIcon: "./assets/images/splash-logo-android-dark.xml"
      });
      // An image would also reach Android (the plugin merges the top level into `android`).
      expect(options.image).toBeUndefined();
      expect(options.android?.image).toBeUndefined();
      expect(options.dark?.image).toBeUndefined();
      expect(options.android?.dark?.image).toBeUndefined();
      expect(options.ios?.image).toBe("./assets/images/splash-logo.png");
      expect(options.ios?.dark?.image).toBe("./assets/images/splash-logo-dark.png");
      // The plugin's default is 100.
      expect(options.ios?.imageWidth).toBe(288);
    }
  });

  // A device in dark mode: the splash screen on the dark theme's background, as the app's first
  // screen will be under "Automatic", the default.
  it("shows the splash screen on each theme's canvas", () => {
    for (const variant of ["staging", "production"]) {
      const options = splashScreenOptions(variant);
      expect(options.backgroundColor).toBe("#FFFFFF");
      expect(options.dark?.backgroundColor).toBe(darkColors.background.app);
    }
  });

  // The app follows the device's light or dark mode, or the theme chosen (src/features/appearance/):
  // the system's own parts with it. Android needs expo-system-ui for it (Expo's docs).
  it("lets the app follow the device's light or dark mode", () => {
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).userInterfaceStyle).toBe("automatic");
    }
    expect(dependencies).toHaveProperty("expo-system-ui");
  });

  // The fingerprint hashes the splash screen images, not the drawables: fingerprint.config.js adds
  // them, without which a new drawable would not start a new staging build.
  it("puts the Android splash screen drawables in the native fingerprint", () => {
    const { extraSources = [] } = jest.requireActual<{ extraSources?: { filePath?: string }[] }>(
      "../../fingerprint.config.js"
    );
    const { icon = "", darkIcon = "" } = splashScreenOptions("staging").android?.drawable ?? {};
    const sources = extraSources.map(({ filePath }) => filePath);

    expect(icon).not.toBe("");
    expect(darkIcon).not.toBe("");
    expect(sources).toContain(icon.replace(/^\.\//, ""));
    expect(sources).toContain(darkIcon.replace(/^\.\//, ""));
  });

  // Reads package.json instead of hardcoding 3.0.0, so that a release that only bumps
  // the version keeps this test green.
  it("derives a versionCode above the last v2 builds (485, 485001-485004)", () => {
    const config = resolve("production");
    const buildNumber = getBuildNumber(version);

    expect(config.version).toBe(version);
    expect(config.android?.versionCode).toBe(buildNumber);
    expect(config.ios?.buildNumber).toBe(String(buildNumber));
    expect(buildNumber).toBeGreaterThan(485_004);
  });

  it("maps MAJOR.MINOR.PATCH to MAJOR*1_000_000 + MINOR*1_000 + PATCH", () => {
    expect(getBuildNumber("3.0.0")).toBe(3_000_000);
    expect(getBuildNumber("3.12.7")).toBe(3_012_007);
    expect(getBuildNumber("3.999.999")).toBe(3_999_999);
  });

  it("rejects versions that would not map to a unique, increasing build number", () => {
    expect(() => getBuildNumber("3.0.0-rc.1")).toThrow(/MAJOR\.MINOR\.PATCH/);
    expect(() => getBuildNumber("3.0")).toThrow(/MAJOR\.MINOR\.PATCH/);
    expect(() => getBuildNumber("3.1000.0")).toThrow(/<= 999/);
    expect(() => getBuildNumber("3.0.1000")).toThrow(/<= 999/);
  });

  // Staging is on mainnet too (see app.config.ts): its wallets hold real sats. Changing the network
  // of a variant must be a deliberate change of this test.
  it("connects every variant to the Breez mainnet", () => {
    expect(resolve("production").extra?.breezNetwork).toBe("mainnet");
    expect(resolve("staging").extra?.breezNetwork).toBe("mainnet");
  });

  it("only uses Breez networks that the app supports at runtime", () => {
    for (const variant of ["staging", "production"]) {
      expect(BREEZ_NETWORKS).toContain(resolve(variant).extra?.breezNetwork);
    }
  });

  // The wallet is derived from a passkey bound to this domain, PASSKEY_RP_ID of the EAS environment
  // of the build: changing it gives every user of the variant another, empty wallet.
  it("binds the passkeys of every variant to PASSKEY_RP_ID", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant, {}, { PASSKEY_RP_ID: "passkeys.example.com" });

      expect(config.extra?.passkeyRpId).toBe("passkeys.example.com");
      // Every variant also claims the links of its web app (below).
      expect(
        config.ios?.associatedDomains?.filter((domain) => !domain.startsWith("applinks:"))
      ).toEqual(["webcredentials:passkeys.example.com"]);
    }
  });

  // Like a build without Breez API key: the app starts and refuses passkeys (local development,
  // CI). An EAS build without it would be useless.
  it("builds without passkeys when PASSKEY_RP_ID is not set, but never on EAS Build", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant, {}, { PASSKEY_RP_ID: undefined });

      expect(config.extra).not.toHaveProperty("passkeyRpId");
      expect(config.ios?.associatedDomains ?? []).not.toContainEqual(
        expect.stringMatching(/^webcredentials:/)
      );
      expect(() => resolve(variant, {}, { PASSKEY_RP_ID: " ", EAS_BUILD: "true" })).toThrow(
        /PASSKEY_RP_ID is not set/
      );
    }
  });

  // The RP ID is a host: a URL, a port or another case would bind the passkeys to nothing valid.
  it("only takes a bare, lowercase domain name as PASSKEY_RP_ID", () => {
    expect(parsePasskeyRpId(undefined)).toBeUndefined();
    expect(parsePasskeyRpId("")).toBeUndefined();
    expect(parsePasskeyRpId(" passkeys.example.com\n")).toBe("passkeys.example.com");
    expect(parsePasskeyRpId("app--staging.example.com")).toBe("app--staging.example.com");

    for (const value of [
      "https://passkeys.example.com",
      "passkeys.example.com/",
      "passkeys.example.com:443",
      "Passkeys.example.com",
      "passkeys.example.com.",
      "passkeys..example.com",
      "-passkeys.example.com",
      "passkeys-.example.com",
      "pass keys.example.com",
      "localhost",
      "192.0.2.1",
      `${"a".repeat(64)}.example.com`,
      `${"a.".repeat(127)}com`
    ]) {
      expect(() => parsePasskeyRpId(value)).toThrow(/is not a domain name/);
    }
  });

  // Every page of a variant's web app (a team invitation, a payment link) opens in the app when it
  // is installed. Its association files come from scripts/passkey-association.js
  // (passkey-association.test.ts). The web app is on the RP ID's host, never written in the
  // repository.
  it("opens the links of its own web app, on the RP ID's host, in every variant", () => {
    const host = "web.example";
    const filter = {
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: "https", host }],
      category: ["BROWSABLE", "DEFAULT"]
    };
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant, {}, { PASSKEY_RP_ID: host });
      expect(config.ios?.associatedDomains).toEqual([
        `webcredentials:${host}`,
        `applinks:${host}`,
        PRINTED_LINKS_DOMAIN
      ]);
      expect(config.android?.intentFilters).toEqual([filter, PRINTED_LINKS_FILTER]);
      expect(config.extra?.webAppOrigin).toBe(`https://${host}`);
      // Without RP ID (local, CI), no web app: no links of its to claim, no payment links.
      const noPasskeys = resolve(variant, {}, { PASSKEY_RP_ID: undefined });
      expect(noPasskeys.ios?.associatedDomains).toEqual([PRINTED_LINKS_DOMAIN]);
      expect(noPasskeys.android?.intentFilters).toEqual([PRINTED_LINKS_FILTER]);
      expect(noPasskeys.extra).not.toHaveProperty("webAppOrigin");
    }
  });

  // The link printed on the v2 cards (`https://sbpc.ch/<number>`) opens
  // every variant, with or without RP ID: its host's own association files say which (never
  // scripts/passkey-association.js, passkey-association.test.ts). The host is the app's
  // (LEGACY_CARD_LINK_HOST), which app.config.ts cannot import.
  it("opens the links printed on the v2 cards, their numbers' paths only, in every variant", () => {
    expect(PRINTED_LINKS_DOMAIN).toBe(`applinks:${LEGACY_CARD_LINK_HOST}`);
    for (const variant of ["staging", "production"]) {
      for (const rpId of ["passkeys.example.com", undefined]) {
        const config = resolve(variant, {}, { PASSKEY_RP_ID: rpId });
        expect(config.ios?.associatedDomains).toContain(PRINTED_LINKS_DOMAIN);
        expect(config.android?.intentFilters).toContainEqual(PRINTED_LINKS_FILTER);
      }
    }
    // Android's pattern (a period: any one character, as in a regular expression; no `*` in it)
    // takes a printed number's path, as the app reads it, and no shorter or longer path.
    const pattern = new RegExp(`^${PRINTED_LINKS_FILTER.data[0].pathPattern}$`);
    expect(pattern.test(new URL("https://sbpc.ch/1709-1248-5643-8482").pathname)).toBe(true);
    expect(legacyCardLinkNumber("https://sbpc.ch/1709-1248-5643-8482")).toBe("1709-1248-5643-8482");
    for (const path of ["/", "/1709-1248-5643-848", "/1709-1248-5643-84821", "/1709124856438482"]) {
      expect(pattern.test(path)).toBe(false);
    }
  });

  // One entry for every QR code scanned ("Send", team invitations): with two entries, both
  // would write the camera usage description, and only one of the two texts would be shown.
  it("uses the camera to scan QR codes, never the microphone", () => {
    for (const variant of ["staging", "production"]) {
      const plugins = resolve(variant).plugins ?? [];
      const camera = plugins.filter(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera"
      );
      expect(camera).toEqual([
        [
          "expo-camera",
          expect.objectContaining({ microphonePermission: false, recordAudioAndroid: false })
        ]
      ]);
    }
  });

  // iOS shows one camera usage description, written by both plugins: whichever runs last wins, so
  // both give the same text, which names the articles' photos taken with expo-image-picker.
  it("gives the camera one usage description, the same in both plugins that write it", () => {
    for (const variant of ["staging", "production"]) {
      const plugins = resolve(variant).plugins ?? [];
      const texts = ["expo-camera", "expo-image-picker"].map((name) => {
        const entry = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === name);
        return (entry as [string, { cameraPermission?: unknown }] | undefined)?.[1]
          .cameraPermission;
      });
      expect(typeof texts[0]).toBe("string");
      expect(texts[1]).toBe(texts[0]);
      expect(texts[0]).toMatch(/photos/);
    }
  });

  // iOS shows one Face ID usage description, written by both plugins: whichever runs last wins, so
  // both give the app lock's text (src/features/app-lock/), never `false` (which removes the key
  // the lock needs) nor a plugin's default text.
  it("gives Face ID one usage description, the app lock's, in both plugins that write it", () => {
    for (const variant of ["staging", "production"]) {
      const plugins = resolve(variant).plugins ?? [];
      const texts = ["expo-local-authentication", "expo-secure-store"].map((name) => {
        const entries = plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === name);
        expect(entries).toHaveLength(1);
        return (entries[0] as [string, { faceIDPermission?: unknown }])[1].faceIDPermission;
      });
      expect(texts[0]).toEqual(expect.stringMatching(/^sattle\.me uses Face ID to unlock/));
      expect(texts[1]).toBe(texts[0]);
    }
  });

  // The photo library gives the business's logo, the profile photos and the articles' photos.
  it("names the articles' photos in the photo library's usage description", () => {
    for (const variant of ["staging", "production"]) {
      const plugins = resolve(variant).plugins ?? [];
      const picker = plugins.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker"
      ) as [string, { photosPermission?: unknown }] | undefined;
      expect(picker?.[1].photosPermission).toEqual(expect.stringMatching(/logo.*articles' photos/));
    }
  });

  // The scan's beep (src/features/catalog/scan-beep.ts): played in the foreground only.
  it("plays the scan's beep without the microphone nor playback in the background", () => {
    for (const variant of ["staging", "production"]) {
      const plugins = resolve(variant).plugins ?? [];
      expect(plugins.filter((plugin) => plugin === "expo-audio")).toEqual([]);
      expect(
        plugins.filter((plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio")
      ).toEqual([
        [
          "expo-audio",
          {
            microphonePermission: false,
            recordAudioAndroid: false,
            enableBackgroundPlayback: false,
            enableBackgroundRecording: false
          }
        ]
      ]);
    }
  });

  // Passkeys with the PRF extension, from which the wallet is derived: iOS 18, Android 9 (API 28).
  it("is only offered to devices that support the passkey the wallet is derived from", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);

      expect(config.ios?.deploymentTarget).toBe("18.0");
      expect(config.plugins).toContainEqual([
        "expo-build-properties",
        expect.objectContaining({ android: expect.objectContaining({ minSdkVersion: 28 }) })
      ]);
    }
  });

  // Without it, EAS CLI asks and writes the answer with its own @expo/config, which cannot load the
  // project's TypeScript plugins: an iOS build stops before it starts (app.config.ts).
  it("answers Apple's export compliance question itself: only exempt encryption, as v2", () => {
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
    }
  });

  // App Store Connect refuses a binary that uses a required reason API without a reason in a privacy
  // manifest; Apple does not read every manifest of the static libraries, so the app's own states
  // each category its dependencies declare, and those of the Breez SDK's library, which has none.
  it("states a reason for every required reason API its native libraries use", () => {
    const declared = (variant: string) =>
      new Map(
        (resolve(variant).ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? []).map((entry) => [
          entry.NSPrivacyAccessedAPIType,
          entry.NSPrivacyAccessedAPITypeReasons
        ])
      );
    const needed = new Set([
      // The Breez SDK's static library: `stat`, `fstat`, `lstat`, `statfs`, `fstatfs` (app.config.ts).
      "NSPrivacyAccessedAPICategoryFileTimestamp",
      "NSPrivacyAccessedAPICategoryDiskSpace",
      ...Object.keys(dependencies).flatMap((name) =>
        dependencyPrivacyManifests(name).flatMap((manifest) =>
          [...manifest.matchAll(/<string>(NSPrivacyAccessedAPICategory\w+)<\/string>/g)].map(
            ([, category]) => category
          )
        )
      )
    ]);
    // React Native's own manifest: the scan above found the manifests.
    expect(needed).toContain("NSPrivacyAccessedAPICategorySystemBootTime");
    for (const variant of ["staging", "production"]) {
      const reasons = declared(variant);
      expect([...needed].filter((category) => !reasons.has(category))).toEqual([]);
      for (const list of reasons.values()) {
        expect(list.length).toBeGreaterThan(0);
        // Reasons Apple lets third-party SDKs declare, never an app.
        expect(list).not.toContain("0A2A.1");
        expect(list).not.toContain("C56D.1");
      }
      expect(resolve(variant).ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
      expect(resolve(variant).ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
    }
  });

  // Expo's template declares SYSTEM_ALERT_WINDOW ("optional permissions"), which prebuild keeps:
  // the app never draws over other apps.
  it("never asks to draw over other apps on Android", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      expect(config.android?.blockedPermissions).toContain(
        "android.permission.SYSTEM_ALERT_WINDOW"
      );
      expect(config.android?.permissions).not.toContain("android.permission.SYSTEM_ALERT_WINDOW");
    }
  });

  // R8, Expo SDK 58's default for release builds, stays off until tried on devices: it renames
  // classes that are loaded by their name (the card socket's task consumer) and the stacks Expo
  // Observe reads.
  it("builds its Android releases without R8", () => {
    for (const variant of ["staging", "production"]) {
      const options = resolve(variant).plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
      ) as [string, { android: Record<string, unknown> }] | undefined;

      expect(options?.[1].android).toEqual({
        minSdkVersion: 28,
        enableMinifyInReleaseBuilds: false
      });
    }
  });

  // HTTPS only: Android refuses the app's unencrypted requests (its default since Android 9, never
  // turned off: no `usesCleartextTraffic` nor network security configuration); iOS keeps HTTPS
  // everywhere but local addresses, and says why it reaches the local network (the merchant's node,
  // over HTTPS: src/lib/onchain/node.ts).
  it("sends no unencrypted request on Android, and says why it reaches the local network on iOS", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true
      });
      expect(config.ios?.infoPlist?.NSLocalNetworkUsageDescription).toMatch(/Bitcoin node/);
      const options = config.plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
      ) as [string, { android: Record<string, unknown> }] | undefined;
      expect(options?.[1].android).not.toHaveProperty("usesCleartextTraffic");
      expect(options?.[1].android).not.toHaveProperty("networkSecurityConfig");
    }
  });

  // No backup to Google Drive: Android backs an app's data up unless told otherwise.
  // expo-secure-store's rules stay (its plugin's default, `configureAndroidBackup`): they keep a
  // device-to-device transfer, which `allowBackup` does not turn off on Android 12+, to the app's
  // preferences, never the secure store's.
  it("keeps the app's data out of Android's backups", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      expect(config.android?.allowBackup).toBe(false);
      const secureStore = config.plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-secure-store"
      ) as [string, Record<string, unknown>] | undefined;
      expect(secureStore).toBeDefined();
      expect(secureStore?.[1]).not.toHaveProperty("configureAndroidBackup");
    }
  });

  // Expo SDK 58 renders the web app on a server when `web.output` is not set, and splits its bundle
  // by route: neither, as before (app.config.ts).
  it("exports its web app as one page split by screen, rendered in the browser only", () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);

      expect(config.web?.output).toBe("single");
      expect(config.plugins).toContainEqual(["expo-router", { asyncRoutes: { web: true } }]);
    }
  });

  // Its `enablePasskey` option would add webcredentials:keys.breez.technology (Breez shared RP).
  it("adds the Breez config plugin without its passkey option", () => {
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).plugins).toContain("@breeztech/breez-sdk-spark-react-native");
    }
  });

  // BoltCards (NTAG 424 DNA) read through NFCTagReaderSession: the `TAG` format only, `NDEF` gets
  // the build refused by App Store Connect (ITMS-90778); the Type 4 NDEF application identifier,
  // without which Core NFC does not hand ISO 7816 tags over.
  it("asks for the iOS NFC reading formats that the App Store accepts", () => {
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).plugins).toContainEqual([
        "react-native-nfc-manager",
        expect.objectContaining({
          includeNdefEntitlement: false,
          selectIdentifiers: ["D2760000850101"]
        })
      ]);
    }
  });

  // Card payments: a push token for the card relay, shown notifications only (no background
  // processing, src/features/card/push.ts).
  it("adds expo-notifications without background remote notifications", () => {
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).plugins).toContainEqual([
        "expo-notifications",
        {
          enableBackgroundRemoteNotifications: false,
          icon: "./assets/images/notification-icon.png",
          color: "#F7931A"
        }
      ]);
    }
  });

  // The iOS notification service extension: built in both variants, with values its plugin and
  // EAS accept; the same target, bundle identifier and app group for the plugin and for EAS. Their
  // Apple identifiers exist for both (the extension's App ID, the app group).
  it("adds the card notification extension to both variants, each with its own identifiers", () => {
    const expected = {
      staging: {
        bundleIdentifier: "ch.swissbitcoinpay.checkout.staging.CardNotificationService",
        appGroup: "group.ch.swissbitcoinpay.checkout.staging.cards"
      },
      production: {
        bundleIdentifier: "ch.swissbitcoinpay.checkout.CardNotificationService",
        appGroup: "group.ch.swissbitcoinpay.checkout.cards"
      }
    } as const;
    for (const variant of ["staging", "production"] as const) {
      const config = resolve(variant);
      const appId = config.ios?.bundleIdentifier ?? "";
      const props = cardNotificationExtension(appId);
      expect([variant, props]).toEqual([
        variant,
        {
          targetName: "CardNotificationService",
          ...expected[variant],
          deploymentTarget: config.ios?.deploymentTarget
        }
      ]);
      // Values Apple and EAS accept (the plugin refuses the others).
      expect(checkProps(props, appId)).toBe(props);

      expect(config.plugins).toContainEqual([
        "./plugins/card-notification-extension/app.plugin",
        props
      ]);
      // The app finds the container it shares with the extension (app-group-name.ts).
      expect(config.extra?.cardAppGroup).toBe(props.appGroup);
      // Declared to EAS, which makes its provisioning profile before prebuild.
      expect(config.extra?.eas?.build?.experimental?.ios?.appExtensions).toEqual([
        {
          targetName: props.targetName,
          bundleIdentifier: props.bundleIdentifier,
          entitlements: { "com.apple.security.application-groups": [props.appGroup] }
        }
      ]);
    }
  });

  // Of a local plugin, the fingerprint hashes the plugin's file only: the Swift files and podspecs
  // it copies must start a staging build too, never ship as an update.
  it("puts the card notification extension's files in the native fingerprint", () => {
    const { extraSources = [] } = jest.requireActual<{
      extraSources?: { type?: string; filePath?: string }[];
    }>("../../fingerprint.config.js");
    expect(extraSources).toContainEqual(
      expect.objectContaining({ type: "dir", filePath: "plugins/card-notification-extension" })
    );
  });

  // Android draws a notification's small icon from its alpha only: an opaque or coloured one shows
  // as a white square.
  it("gives Android a white notification icon on transparent, 96 px square", () => {
    const options = resolve("production").plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications"
    ) as [string, { icon?: string }];
    const png = readConfigImage(options[1].icon);
    expect([png.width, png.height]).toEqual([96, 96]);
    let transparent = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.alpha(x, y) === 0) transparent++;
        else expect(png.rgb(x, y)).toEqual([255, 255, 255]);
      }
    }
    expect(transparent).toBeGreaterThan(0);
    // The "s" and its dot, apart: the icon is not a plain shape.
    expect(png.alpha(48, 48)).toBe(255);
    expect(png.alpha(77, 67)).toBe(255);
    expect(png.alpha(62, 64)).toBe(0);
  });

  // expo-screen-capture (the recovery phrase) declares permissions of its screenshot listener,
  // which the app never uses: the photo one is blocked (Google Play's photo permissions policy),
  // not the capture callback's, which the module registers at start-up on Android 14+.
  it("blocks the photo permission expo-screen-capture declares, not its capture callback's", () => {
    const manifest = new TextDecoder().decode(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "node_modules",
          "expo-screen-capture",
          "android",
          "src",
          "main",
          "AndroidManifest.xml"
        )
      )
    );
    expect(manifest).toContain('"android.permission.READ_MEDIA_IMAGES"');
    expect(manifest).toContain('"android.permission.DETECT_SCREEN_CAPTURE"');
    for (const variant of ["staging", "production"]) {
      expect(resolve(variant).android?.blockedPermissions).toContain(
        "android.permission.READ_MEDIA_IMAGES"
      );
      expect(resolve(variant).android?.blockedPermissions).not.toContain(
        "android.permission.DETECT_SCREEN_CAPTURE"
      );
    }
  });

  // "Where to pay with your card" (src/features/card/MerchantMap.tsx): BTC Map's map asks for the
  // position when its "locate" button is tapped, while the app is in use only.
  it('asks for the position while the app is in use only, for "Where to pay"\'s map', () => {
    for (const variant of ["staging", "production"]) {
      const config = resolve(variant);
      const infoPlist = config.ios?.infoPlist ?? {};
      expect(infoPlist.NSLocationWhenInUseUsageDescription).toEqual(
        expect.stringMatching(/^sattle\.me uses your location only when you ask .*BTC Map/)
      );
      // Never "always": no key that would let iOS ask for the position in the background.
      expect(
        Object.keys(infoPlist).filter((key) => /^NSLocation/.test(key) && !/WhenInUse/.test(key))
      ).toEqual([]);
      expect(infoPlist.UIBackgroundModes ?? []).not.toContain("location");
      // Android 12+ offers precise or approximate only when both are declared.
      expect(config.android?.permissions).toEqual([
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]);
      expect(config.android?.blockedPermissions).toContain(
        "android.permission.ACCESS_BACKGROUND_LOCATION"
      );
    }
  });

  it("rejects unknown variants", () => {
    expect(() => resolve("development")).toThrow(/Invalid APP_VARIANT/);
    expect(() => resolve("prod")).toThrow(/Invalid APP_VARIANT/);
  });
});

// EAS CLI reads the project's id with the config's plugins, which are the project's packages: the
// GitHub jobs that hold an Expo token read it without them. Never anywhere else: an app built
// without its plugins would be another app.
describe("app.config without its plugins", () => {
  const github = { GITHUB_ACTIONS: "true", APP_CONFIG_WITHOUT_PLUGINS: "1" };

  it("leaves the plugins out in a GitHub Actions job, and nothing else", () => {
    for (const variant of ["staging", "production"]) {
      const full = resolve(variant, {}, { APP_CONFIG_WITHOUT_PLUGINS: undefined });
      const bare = resolve(variant, {}, github);
      expect(full.plugins?.length).toBeGreaterThan(0);
      expect(bare.plugins).toEqual([]);
      expect({ ...bare, plugins: full.plugins }).toEqual(full);
      expect(bare.extra?.eas).toEqual(full.extra?.eas);
    }
  });

  it("is refused on EAS Build, outside GitHub Actions, and for any other value", () => {
    const refused = [
      { ...github, EAS_BUILD: "true", PASSKEY_RP_ID: "example.test" },
      { ...github, GITHUB_ACTIONS: undefined },
      { ...github, GITHUB_ACTIONS: "false" },
      { ...github, APP_CONFIG_WITHOUT_PLUGINS: "true" },
      { ...github, APP_CONFIG_WITHOUT_PLUGINS: "0" }
    ];
    for (const env of refused) {
      expect(() => resolve("production", {}, env)).toThrow(
        "APP_CONFIG_WITHOUT_PLUGINS=1 is for the GitHub jobs that run EAS CLI only"
      );
    }
  });

  it("keeps the plugins when the variable is not set or empty", () => {
    for (const value of [undefined, ""]) {
      const config = resolve(
        "staging",
        {},
        { GITHUB_ACTIONS: "true", APP_CONFIG_WITHOUT_PLUGINS: value }
      );
      expect(config.plugins?.length).toBeGreaterThan(0);
    }
  });
});
