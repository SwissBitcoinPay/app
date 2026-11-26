// The iOS notification service extension's config plugin (plugins/card-notification-extension):
// what it adds to the Xcode project Expo's prebuild generates, checked on that very project
// (expo's template.tgz) with the xcode library Expo uses, as no Mac runs these tests.
import {
  CARD_TEXT_TEST_KEY,
  PROBE_MAX_PAY_SATS,
  PROBE_TTL_SECONDS
} from "@/features/card/extension-probe";
import { resources } from "@/i18n";
import { FALLBACK_LANGUAGE, LANGUAGES, toLanguage } from "@/i18n/languages";

import packageJson from "../../package.json";
import plugin, {
  addExtensionTarget,
  APP_GROUPS_KEY,
  CARD_PUSH_LANGUAGES,
  CARD_PUSH_TITLES_FILE,
  hasNativeTarget,
  checkProps,
  EMBED_PHASE,
  EMBED_SCRIPT,
  ENGINE_FILE,
  extensionEntitlementsPlist,
  extensionInfoPlist,
  podfileTarget,
  readCardPushTitles,
  SWIFT_FILES,
  engineConfig,
  type CardNotificationExtensionProps
} from "../../plugins/card-notification-extension/app.plugin";
import { CARD_PAID_NOTICE, CARD_WAKE_NOTICE } from "@/features/card/card-notices";
import { CARD_SHARED_SERVICE } from "@/lib/card/card-keychain";
import { EXTENSION_DIR_NAME } from "@/lib/card/card-files";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const { readFileSync, existsSync } = jest.requireActual<{
  readFileSync(file: string): Uint8Array;
  existsSync(file: string): boolean;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { gunzipSync } = jest.requireActual<{ gunzipSync(data: Uint8Array): Uint8Array }>("zlib");
const { createRequire } = jest.requireActual<{
  createRequire(file: string): ((request: string) => unknown) & { resolve(id: string): string };
}>("module");

const ROOT = join(__dirname, "..", "..");
const PLUGIN_DIR = join(ROOT, "plugins", "card-notification-extension");
// The xcode and plist libraries of Expo's config plugins, whatever npm hoisted.
const fromConfigPlugins = createRequire(
  createRequire(join(ROOT, "package.json")).resolve("@expo/config-plugins")
);

/** What these tests use of an xcode 3 project (the library has no types). */
type Section = Record<string, Record<string, unknown> | string>;
type Project = {
  hash: { project: { objects: Record<string, Section> } };
  getFirstTarget(): { uuid: string; firstTarget: { buildPhases: { value: string }[] } };
  pbxXCBuildConfigurationSection(): Section;
  writeSync(): string;
};
const xcode = fromConfigPlugins("xcode") as { project(file: string): Project };
const pbxproj = fromConfigPlugins("xcode/lib/parser/pbxproj") as { parse(text: string): unknown };
const plist = fromConfigPlugins("@expo/plist") as {
  default: { parse(text: string): Record<string, unknown> };
};

const APP_ID = "ch.swissbitcoinpay.checkout.staging";
const PROPS: CardNotificationExtensionProps = {
  targetName: "CardNotificationService",
  bundleIdentifier: `${APP_ID}.CardNotificationService`,
  appGroup: `group.${APP_ID}.cards`,
  deploymentTarget: "18.0"
};

/** A file of a .tar.gz (ustar: a 512-byte header, then the content in 512-byte blocks). */
function readFromTarball(file: string, name: string): string {
  const archive = gunzipSync(readFileSync(file));
  const field = (start: number, length: number, at: number) =>
    new TextDecoder()
      .decode(archive.subarray(at + start, at + start + length))
      .replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= archive.length;) {
    const fileName = field(0, 100, at);
    if (!fileName) break;
    const prefix = field(345, 155, at);
    const size = parseInt(field(124, 12, at).trim() || "0", 8);
    if ((prefix ? `${prefix}/${fileName}` : fileName) === name) {
      return new TextDecoder().decode(archive.subarray(at + 512, at + 512 + size));
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} is not in ${file}`);
}

/** The Xcode project of a fresh prebuild: expo's own template. */
function templateProject(): Project {
  const text = readFromTarball(
    join(ROOT, "node_modules", "expo", "template.tgz"),
    "package/ios/HelloWorld.xcodeproj/project.pbxproj"
  );
  const project = xcode.project("project.pbxproj");
  project.hash = pbxproj.parse(text) as Project["hash"];
  return project;
}

function phaseOf(project: Project, uuid: string): { isa: string } & Record<string, unknown> {
  for (const section of Object.values(project.hash.project.objects)) {
    const value = section[uuid];
    if (value && typeof value === "object") return value as { isa: string };
  }
  throw new Error(`No object ${uuid}`);
}

/** The paths of a build phase's files (xcode 3 may store a path quoted). */
function filesOf(project: Project, phase: Record<string, unknown> | undefined): string[] {
  const { PBXBuildFile, PBXFileReference } = project.hash.project.objects;
  return ((phase?.files ?? []) as { value: string }[]).map(({ value }) => {
    const file = PBXBuildFile[value] as { fileRef: string };
    const reference = PBXFileReference[file.fileRef] as { path: string };
    return reference.path.replace(/^"(.*)"$/, "$1");
  });
}

/** The extension's native target (its name is stored quoted). */
function extensionTarget(project: Project): Record<string, unknown> | undefined {
  return Object.values(project.hash.project.objects.PBXNativeTarget).find(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value.name === `"${PROPS.targetName}"`
  );
}

function extensionSettings(project: Project): Record<string, unknown>[] {
  return Object.values(project.pbxXCBuildConfigurationSection())
    .filter(
      (value): value is { buildSettings: Record<string, unknown> } => typeof value === "object"
    )
    .map(({ buildSettings }) => buildSettings)
    .filter((settings) => settings.PRODUCT_NAME === `"${PROPS.targetName}"`);
}

describe("card notification extension plugin", () => {
  it("adds the extension's target to the project, embedded in the app", () => {
    const project = templateProject();
    expect(hasNativeTarget(project as never, PROPS.targetName)).toBe(false);
    expect(hasNativeTarget(project as never, "HelloWorld")).toBe(true);
    addExtensionTarget(project as never, PROPS, { version: "3.0.0", buildNumber: "3000000" });
    expect(hasNativeTarget(project as never, PROPS.targetName)).toBe(true);

    const target = extensionTarget(project);
    expect(target?.productType).toBe('"com.apple.product-type.app-extension"');

    // Its sources are the Swift files.
    const phases = (target?.buildPhases as { value: string }[]).map(({ value }) =>
      phaseOf(project, value)
    );
    const sources = phases.find(({ isa }) => isa === "PBXSourcesBuildPhase");
    expect(filesOf(project, sources)).toEqual(SWIFT_FILES);
    // Its resource: the JavaScript its engine runs, bundled at prebuild.
    const extensionResources = phases.find(({ isa }) => isa === "PBXResourcesBuildPhase");
    expect(filesOf(project, extensionResources)).toEqual([ENGINE_FILE]);

    // The app depends on it, copies it into its PlugIns right after its resources, and copies the
    // extension's framework into its Frameworks last.
    const app = project.getFirstTarget();
    const appPhases = app.firstTarget.buildPhases.map(({ value }) => phaseOf(project, value));
    const resources = appPhases.findIndex(({ isa }) => isa === "PBXResourcesBuildPhase");
    const copy = appPhases[resources + 1];
    expect(copy).toMatchObject({ isa: "PBXCopyFilesBuildPhase", dstSubfolderSpec: 13 });
    expect(filesOf(project, copy)).toEqual([`${PROPS.targetName}.appex`]);
    const embed = appPhases[appPhases.length - 1];
    expect(embed).toMatchObject({
      isa: "PBXShellScriptBuildPhase",
      name: `"${EMBED_PHASE}"`,
      shellPath: "/bin/sh",
      shellScript: `"/bin/sh \\"\${SRCROOT}/${PROPS.targetName}/${EMBED_SCRIPT}\\""`,
      alwaysOutOfDate: 1
    });
    expect(embed.inputPaths).toContain(
      '"${PODS_XCFRAMEWORKS_BUILD_DIR}/SattlemeBreezSdkSparkFFI/breez_sdk_sparkFFI.framework"'
    );
    const dependencies = Object.values(project.hash.project.objects.PBXTargetDependency).filter(
      (value): value is Record<string, unknown> => typeof value === "object"
    );
    expect(dependencies.map(({ target: uuid }) => uuid)).toContain(
      Object.entries(project.hash.project.objects.PBXNativeTarget).find(
        ([, value]) => typeof value === "object" && value.name === `"${PROPS.targetName}"`
      )?.[0]
    );

    // Its settings: Info.plist, entitlements, the app's iOS, devices and version.
    const settings = extensionSettings(project);
    expect(settings).toHaveLength(2);
    for (const setting of settings) {
      expect(setting).toMatchObject({
        PRODUCT_BUNDLE_IDENTIFIER: `"${PROPS.bundleIdentifier}"`,
        INFOPLIST_FILE: `${PROPS.targetName}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${PROPS.targetName}/${PROPS.targetName}.entitlements`,
        IPHONEOS_DEPLOYMENT_TARGET: "18.0",
        TARGETED_DEVICE_FAMILY: '"1,2"',
        MARKETING_VERSION: "3.0.0",
        CURRENT_PROJECT_VERSION: "3000000"
      });
    }

    // What it writes is a project Xcode's format reads back.
    expect(() => pbxproj.parse(project.writeSync())).not.toThrow();
  });

  it("adds it once", () => {
    const project = templateProject();
    addExtensionTarget(project as never, PROPS, { version: "3.0.0", buildNumber: "3000000" });
    const before = project.writeSync();
    addExtensionTarget(project as never, PROPS, { version: "3.0.0", buildNumber: "3000000" });
    expect(project.writeSync()).toBe(before);
  });

  it("refuses values Apple or EAS would reject", () => {
    expect(checkProps(PROPS, APP_ID)).toBe(PROPS);
    expect(() => checkProps(undefined, APP_ID)).toThrow();
    expect(() => checkProps(PROPS, undefined)).toThrow();
    // The extension's bundle identifier must extend the app's.
    expect(() => checkProps(PROPS, "ch.swissbitcoinpay.checkout")).toThrow();
    expect(() => checkProps({ ...PROPS, appGroup: `${APP_ID}.cards` }, APP_ID)).toThrow();
    expect(() => checkProps({ ...PROPS, targetName: "Card Service" }, APP_ID)).toThrow();
    expect(() => checkProps({ ...PROPS, deploymentTarget: "18" }, APP_ID)).toThrow();
  });

  it("gives the extension its Info.plist and entitlements", () => {
    const info = plist.default.parse(
      extensionInfoPlist({
        targetName: PROPS.targetName,
        appGroup: PROPS.appGroup,
        version: "3.0.0",
        buildNumber: "3000000",
        cardPushTitles: { fr: "Paiement par carte", en: "Card & <payment>" },
        engine: engineConfig(PROPS.appGroup, "mainnet", " breez-key ")
      })
    );
    expect(info).toMatchObject({
      CFBundlePackageType: "XPC!",
      CFBundleShortVersionString: "3.0.0",
      CFBundleVersion: "3000000",
      NSExtension: {
        NSExtensionPointIdentifier: "com.apple.usernotifications.service",
        NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).NotificationService"
      },
      SattlemeAppGroup: PROPS.appGroup,
      // Read by CardPushText.swift (`titlesKey`), text escaped as XML.
      SattlemeCardPushTitles: { fr: "Paiement par carte", en: "Card & <payment>" },
      // Read by EngineRuntime.swift (`configKey`): the app group, the network and the Breez API
      // key (public: in the app's bundle), nothing else.
      SattlemeEngineConfig: JSON.stringify({
        cardAppGroup: PROPS.appGroup,
        breezNetwork: "mainnet",
        breezApiKey: "breez-key"
      })
    });
    // No key in the build: none given, never an empty one.
    for (const key of [undefined, "", "  "]) {
      expect(JSON.parse(engineConfig(PROPS.appGroup, "mainnet", key))).toEqual({
        cardAppGroup: PROPS.appGroup,
        breezNetwork: "mainnet"
      });
    }
    expect(() => engineConfig(PROPS.appGroup, "signet", "k")).toThrow("Invalid extra.breezNetwork");
    expect(() => engineConfig(PROPS.appGroup, undefined, "k")).toThrow(
      "Invalid extra.breezNetwork"
    );
    expect(plist.default.parse(extensionEntitlementsPlist(PROPS.appGroup))).toEqual({
      [APP_GROUPS_KEY]: [PROPS.appGroup]
    });
  });

  it("installs the Breez SDK's Swift build of the app's Breez version, pinned", () => {
    const breez = packageJson.dependencies["@breeztech/breez-sdk-spark-react-native"];
    const target = podfileTarget(PROPS.targetName, "../plugins/card-notification-extension/pods");
    expect(target).toContain(`target '${PROPS.targetName}' do`);
    for (const pod of ["SattlemeBigNumber", "SattlemeBreezSdkSparkFFI", "SattlemeBreezSdkSpark"]) {
      expect(target).toContain(
        `pod '${pod}', :podspec => '../plugins/card-notification-extension/pods/${pod}.podspec'`
      );
      expect(existsSync(join(PLUGIN_DIR, "pods", `${pod}.podspec`))).toBe(true);
    }
    const spec = (name: string) =>
      new TextDecoder().decode(readFileSync(join(PLUGIN_DIR, "pods", `${name}.podspec`)));
    // Both Breez pods are the version of the app's Breez packages, upgraded with them.
    expect(spec("SattlemeBreezSdkSparkFFI")).toContain(`s.version               = "${breez}"`);
    expect(spec("SattlemeBreezSdkSparkFFI")).toContain(`/releases/download/${breez}/`);
    expect(spec("SattlemeBreezSdkSparkFFI")).toMatch(/:sha256 => "[0-9a-f]{64}"/);
    expect(spec("SattlemeBreezSdkSpark")).toContain(`s.version               = "${breez}"`);
    expect(spec("SattlemeBreezSdkSpark")).toContain(
      `s.dependency "SattlemeBreezSdkSparkFFI", "${breez}"`
    );
    // Sources from git at a commit, never a moving tag or branch.
    expect(spec("SattlemeBreezSdkSpark")).toMatch(/:commit => "[0-9a-f]{40}"/);
    expect(spec("SattlemeBigNumber")).toMatch(/:commit => "[0-9a-f]{40}"/);
  });

  // EngineRuntime.swift reads what the app's TypeScript writes: its names are checked in the
  // source against the app's (no Swift compiler runs these tests).
  it("gives the engine the card items the app shares, and writes only the extension's own files", () => {
    const runtime = new TextDecoder().decode(
      readFileSync(join(PLUGIN_DIR, "ios", "EngineRuntime.swift"))
    );
    const constant = (name: string) =>
      new RegExp(`static let ${name} = "([^"]*)"`).exec(runtime)?.[1];
    expect(constant("cardItemService")).toBe(`${CARD_SHARED_SERVICE}:no-auth`);
    expect(constant("configKey")).toBe("SattlemeEngineConfig");
    // As the fake host of the engine's tests (jest/engine-host.ts): `extension/` only.
    expect(constant("ownDirectory")).toBe("extension");
    // Removed by the app at "Log out" (device-wipe.ts).
    expect(constant("ownDirectory")).toBe(EXTENSION_DIR_NAME);
    for (const write of ["write", "move", "makeDirectory", "remove"]) {
      expect(runtime).toMatch(
        new RegExp(`let ${write}: @convention\\(block\\)[^{]*\\{[^]*?self\\.writable\\(`)
      );
    }
  });

  // CardWake.swift calls the engine's card payment and reads its outcome: its names are checked in
  // the source against the app's (no Swift compiler runs these tests; it was compiled and run on
  // Linux against its cases).
  it("runs a card's tap in the engine, the notification's data the app's own", () => {
    const swift = (file: string) =>
      new TextDecoder().decode(readFileSync(join(PLUGIN_DIR, "ios", file)));
    const wake = swift("CardWake.swift");
    const entry = /static let entry = "([^"]*)"/.exec(wake)?.[1];
    expect(entry).toBe("sattlemeEngineCardWake");
    expect(swift("../../../src/lib/engine/probe-entry.ts")).toContain(`scope.${entry} = (`);
    const kinds = /static let answeredKinds: Set<String> = \[([^\]]*)\]/.exec(wake)?.[1];
    expect(
      kinds
        ?.split(",")
        .map((kind) => kind.trim().replace(/"/g, ""))
        .sort()
    ).toEqual([CARD_PAID_NOTICE, CARD_WAKE_NOTICE].sort());
    // The engine's time ends before the system's, its outcome shown within it.
    expect(wake).toContain("static let extensionSeconds: TimeInterval = 30");
    expect(wake).toMatch(/static let marginSeconds: TimeInterval = [1-9]\b/);
    expect(swift("EngineRuntime.swift")).toContain("entry: CardWake.entry,");
    // The payment runs for a card's wake-up, and the time's end shows the title in its language.
    const service = swift("NotificationService.swift");
    expect(service).toContain("EngineRuntime.runCardWake(");
    expect(service).toMatch(/deliver\(probe\.map \{[^}]*\}, title: wakeTitle\)/);
  });

  it("ships every file it copies", () => {
    for (const file of [...SWIFT_FILES, EMBED_SCRIPT]) {
      expect(existsSync(join(PLUGIN_DIR, "ios", file))).toBe(true);
    }
    expect(typeof plugin).toBe("function");
  });

  // Anyone with the phone's push token can send it a
  // `sattlemeProbe` notification. No Swift compiler runs these tests: the guards are checked in
  // the source, their bounds against the app's.
  it("pays only a run the app asked for, within the test's bound", () => {
    const swift = (file: string) =>
      new TextDecoder().decode(readFileSync(join(PLUGIN_DIR, "ios", file)));
    const probe = swift("CardProbe.swift");
    const service = swift("NotificationService.swift");
    const constant = (name: string) => {
      const match = new RegExp(`static let ${name}: \\w+ = ([\\d_]+)`).exec(probe);
      return match ? Number(match[1].replace(/_/g, "")) : NaN;
    };

    expect(BigInt(constant("maxPaySats"))).toBe(PROBE_MAX_PAY_SATS);
    expect(constant("maxPayFeeSats")).toBeLessThanOrEqual(10);
    expect(constant("maxAgeMs")).toBeGreaterThanOrEqual(PROBE_TTL_SECONDS * 1000);
    expect(constant("maxAgeMs")).toBeLessThanOrEqual(PROBE_TTL_SECONDS * 1000 + 120_000);

    // The run expected before anything starts, the bound between preparing and sending.
    const expected = service.indexOf("ProbeExpectation.isExpected(");
    expect(expected).toBeGreaterThan(-1);
    expect(expected).toBeLessThan(service.indexOf("CardProbe(request:"));
    const prepare = probe.indexOf("sdk.prepareSendPayment(");
    const bound = probe.indexOf("guard CardProbe.isWithinPayBound(prepared) else { throw");
    expect(prepare).toBeGreaterThan(-1);
    expect(bound).toBeGreaterThan(prepare);
    expect(probe.indexOf("sdk.sendPayment(")).toBeGreaterThan(bound);
    expect(probe.match(/sdk\.sendPayment\(/g)).toHaveLength(1);
  });

  it("gives the extension the card's push title of every language of the app", () => {
    const json = new TextDecoder().decode(readFileSync(join(PLUGIN_DIR, CARD_PUSH_TITLES_FILE)));
    const titles = readCardPushTitles(json);
    expect([...CARD_PUSH_LANGUAGES].sort()).toEqual([...LANGUAGES].sort());
    for (const language of LANGUAGES) {
      // Equal to the app's translation: a change of `card.payment.title` changes this file too.
      expect([language, titles[language]]).toEqual([
        language,
        resources[language].translation.card.payment.title
      ]);
    }
  });

  it("refuses a titles file that misses a language or holds a title iOS would not show whole", () => {
    const valid = Object.fromEntries(CARD_PUSH_LANGUAGES.map((l) => [l, "Card payment"]));
    expect(readCardPushTitles(JSON.stringify(valid))).toEqual(valid);
    const bad = [
      "[]",
      "null",
      JSON.stringify({ ...valid, fr: undefined }),
      JSON.stringify({ ...valid, nl: "Kaartbetaling" }),
      JSON.stringify({ ...valid, fr: "" }),
      JSON.stringify({ ...valid, fr: "  " }),
      JSON.stringify({ ...valid, fr: "x".repeat(65) }),
      JSON.stringify({ ...valid, fr: "Paiement\npar carte" }),
      JSON.stringify({ ...valid, fr: 7 })
    ];
    for (const json of bad) expect(() => readCardPushTitles(json)).toThrow();
  });

  // CardPushText.swift picks the language as the app does (src/i18n/languages.ts): its constants
  // are the app's, and its vectors, which it was compiled and run against with Swift on Linux,
  // are toLanguage's own answers.
  it("picks the title's language in Swift as the app picks its own", () => {
    const swift = new TextDecoder().decode(
      readFileSync(join(PLUGIN_DIR, "ios", "CardPushText.swift"))
    );
    const languages = /static let languages: Set<String> = \[([^\]]*)\]/.exec(swift)?.[1];
    expect(
      languages
        ?.split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .sort()
    ).toEqual([...LANGUAGES].sort());
    expect(swift).toContain(`static let fallback = "${FALLBACK_LANGUAGE}"`);
    expect(swift).toContain('static let swissGermanRegions: Set<String> = ["CH", "LI"]');
    expect(swift).toContain('static let titlesKey = "SattlemeCardPushTitles"');
    expect(swift).toContain(`static let testKey = "${CARD_TEXT_TEST_KEY}"`);
    const vectors = JSON.parse(
      new TextDecoder().decode(readFileSync(join(PLUGIN_DIR, "card-push-language-vectors.json")))
    ) as [string, string][];
    expect(vectors.length).toBeGreaterThan(20);
    for (const [tag, language] of vectors) expect([tag, toLanguage(tag)]).toEqual([tag, language]);
    // Every language, and the fallback, among the vectors.
    expect(new Set(vectors.map(([, language]) => language))).toEqual(new Set(LANGUAGES));
  });
});
