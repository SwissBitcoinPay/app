import {
  withDangerousMod,
  withEntitlementsPlist,
  withPodfile,
  withXcodeProject,
  type ConfigPlugin,
  type XcodeProject
} from "expo/config-plugins";

/*
 * The iOS notification service extension: a
 * second target of the app, which iOS runs for each remote notification that shows an alert and
 * carries `mutable-content: 1`, about 30 seconds, even when the app is not running. It writes a
 * card push's title in the app's language (ios/CardPushText.swift), and measures whether a Breez
 * wallet can be started, synced and used there (ios/CardProbe.swift), and what the app's own code
 * costs in its JavaScriptCore (ios/EngineHost.swift, engine.js); the app and it share an app group
 * (a container and a keychain access group).
 *
 * Expo's prebuild generates `ios/` (never committed, AGENTS.md hard rule 5): this plugin adds to
 * it the target, its Swift files, its Info.plist and entitlements, the app group to the app's
 * entitlements, and the target's pods (the Breez SDK's Swift build, pinned: pods/). Its values
 * come from app.config.ts (`cardNotificationExtension`), which also declares the target to EAS
 * (`extra.eas.build.experimental.ios.appExtensions`): EAS makes its provisioning profile before
 * prebuild runs.
 */

// Node's types are not loaded (tsconfig `types` only lists jest), and loading them would expose
// Node APIs to app code, which runs on Hermes: only what this plugin needs is typed here (as in
// src/__tests__/app-config.test.ts). Expo evaluates this file as CommonJS (@expo/require-utils).
declare const __dirname: string;
declare function require(id: "fs"): {
  readFileSync(file: string, encoding: "utf8"): string;
  mkdirSync(dir: string, options: { recursive: true }): unknown;
  copyFileSync(from: string, to: string): void;
  writeFileSync(file: string, data: string): void;
};
declare function require(id: "child_process"): {
  execFileSync(file: string, args: string[], options: { stdio: "inherit" }): unknown;
};
declare const process: { execPath: string; env: Record<string, string | undefined> };
declare function require(id: "path"): {
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

export type CardNotificationExtensionProps = {
  /** The Xcode target, also the folder of its files in `ios/` and its Swift module. */
  targetName: string;
  /** The app's bundle identifier, then a suffix (Apple requires that prefix). */
  bundleIdentifier: string;
  /** `group.…`: the container and keychain access group the app and the extension share. */
  appGroup: string;
  /** The app's minimum iOS, for the extension too. */
  deploymentTarget: string;
};

export const SWIFT_FILES = [
  "NotificationService.swift",
  "CardPushText.swift",
  "CardWake.swift",
  "EngineHost.swift",
  "EngineRuntime.swift",
  "EngineWallet.swift",
  "CardProbe.swift",
  "DarwinProbePlatform.swift"
] as const;
/**
 * The extension's JavaScript: the app's own TypeScript (src/lib/engine/), bundled at prebuild by
 * scripts/extension-engine.js, a resource of the extension that its JavaScriptCore runs
 * (ios/EngineHost.swift).
 */
export const ENGINE_FILE = "engine.js";
/** Copies the Breez SDK's Rust core into the app (ios/embed-breez-framework.sh says why). */
export const EMBED_SCRIPT = "embed-breez-framework.sh";
export const EMBED_PHASE = "[sattle.me] Embed Breez framework";
export const APP_GROUPS_KEY = "com.apple.security.application-groups";
/** Marks the Podfile's target of the extension: added once. */
const PODFILE_MARK = "# card-notification-extension (plugins/card-notification-extension)";

/**
 * The title of a card's wake-up in each of the app's languages (`card.payment.title`), which the
 * extension writes over the relay's (ios/CardPushText.swift). A JSON file: Expo evaluates this
 * plugin alone, it cannot read the app's TypeScript translations; a test keeps it equal to them.
 */
export const CARD_PUSH_TITLES_FILE = "card-push-titles.json";
export const CARD_PUSH_LANGUAGES = ["fr", "en", "de", "de-CH", "it", "es", "pt", "fi"] as const;

/** The titles of CARD_PUSH_TITLES_FILE, refused unless each language has a plain one-line text. */
export function readCardPushTitles(json: string): Record<string, string> {
  const titles: unknown = JSON.parse(json);
  if (!titles || typeof titles !== "object" || Array.isArray(titles)) {
    throw new Error(`${CARD_PUSH_TITLES_FILE}: not an object`);
  }
  const entries = Object.entries(titles as Record<string, unknown>);
  const languages = entries.map(([language]) => language).sort();
  if (languages.join() !== [...CARD_PUSH_LANGUAGES].sort().join()) {
    throw new Error(`${CARD_PUSH_TITLES_FILE}: one title per language of the app`);
  }
  for (const [language, title] of entries) {
    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      title.length > 64 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(title)
    ) {
      throw new Error(`${CARD_PUSH_TITLES_FILE}: invalid title for ${language}`);
    }
  }
  return titles as Record<string, string>;
}

/** The Breez networks the app's builds use (src/lib/breez/config.ts, BREEZ_NETWORKS). */
const ENGINE_NETWORKS = ["mainnet", "regtest"] as const;

/**
 * The build's settings the extension's engine reads (src/lib/engine/shims/expo-constants.ts, as
 * the app reads `Constants.expoConfig.extra`): its app group, its Breez network and the Breez API
 * key the app's bundle holds (`EXPO_PUBLIC_BREEZ_API_KEY`, not a secret: src/lib/breez/config.ts),
 * nothing else (no passkey's RP ID: the extension never asks a passkey). A JSON text in its
 * Info.plist (EngineRuntime.swift, SattlemeEngineConfig; EngineWallet.swift reads the Breez ones).
 * Without a key, the extension connects no wallet on mainnet.
 */
export function engineConfig(
  appGroup: string,
  breezNetwork: unknown,
  breezApiKey: string | undefined
): string {
  if (!(ENGINE_NETWORKS as readonly unknown[]).includes(breezNetwork)) {
    throw new Error(`Invalid extra.breezNetwork for the extension: ${String(breezNetwork)}`);
  }
  const key = breezApiKey?.trim();
  return JSON.stringify({
    cardAppGroup: appGroup,
    breezNetwork,
    ...(key ? { breezApiKey: key } : {})
  });
}

/** Text in a property list's XML. */
function xmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Refuses values that would build an extension Apple or EAS reject, before anything is written. */
export function checkProps(
  props: CardNotificationExtensionProps | undefined,
  appId: string | undefined
): CardNotificationExtensionProps {
  if (!props) throw new Error("The card notification extension needs its props");
  const { targetName, bundleIdentifier, appGroup, deploymentTarget } = props;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(targetName)) {
    throw new Error(`Invalid extension target name: ${targetName}`);
  }
  if (!appId) throw new Error("The card notification extension needs ios.bundleIdentifier");
  if (bundleIdentifier !== `${appId}.${targetName}`) {
    throw new Error(`The extension's bundle identifier must be ${appId}.${targetName}`);
  }
  if (!/^group\.[A-Za-z0-9.-]+$/.test(appGroup)) {
    throw new Error(`Invalid app group: ${appGroup}`);
  }
  if (!/^\d+\.\d+$/.test(deploymentTarget)) {
    throw new Error(`Invalid deployment target: ${deploymentTarget}`);
  }
  return props;
}

const withAppGroup: ConfigPlugin<CardNotificationExtensionProps> = (config, { appGroup }) =>
  withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults[APP_GROUPS_KEY];
    const list = Array.isArray(groups) ? groups.map(String) : [];
    if (!list.includes(appGroup)) list.push(appGroup);
    mod.modResults[APP_GROUPS_KEY] = list;
    return mod;
  });

/** The extension's Info.plist: its version is the app's (Apple refuses one that differs). */
export function extensionInfoPlist({
  targetName,
  appGroup,
  version,
  buildNumber,
  cardPushTitles,
  engine
}: {
  targetName: string;
  appGroup: string;
  version: string;
  buildNumber: string;
  cardPushTitles: Record<string, string>;
  /** engineConfig's text. */
  engine: string;
}): string {
  const titles = Object.entries(cardPushTitles)
    .map(
      ([language, title]) =>
        `    <key>${xmlText(language)}</key>\n    <string>${xmlText(title)}</string>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${targetName}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildNumber}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
  <key>SattlemeAppGroup</key>
  <string>${appGroup}</string>
  <key>SattlemeCardPushTitles</key>
  <dict>
${titles}
  </dict>
  <key>SattlemeEngineConfig</key>
  <string>${xmlText(engine)}</string>
</dict>
</plist>
`;
}

export function extensionEntitlementsPlist(appGroup: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>${APP_GROUPS_KEY}</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`;
}

/** Writes the extension's files into `ios/<target>/` (prebuild's output). */
const withExtensionFiles: ConfigPlugin<CardNotificationExtensionProps> = (config, props) =>
  withDangerousMod(config, [
    "ios",
    (mod) => {
      const target = path.join(mod.modRequest.platformProjectRoot, props.targetName);
      fs.mkdirSync(target, { recursive: true });
      for (const file of [...SWIFT_FILES, EMBED_SCRIPT]) {
        fs.copyFileSync(path.join(__dirname, "ios", file), path.join(target, file));
      }
      // Bundled from the project's sources now: never stale, never committed.
      childProcess.execFileSync(
        process.execPath,
        [
          path.join(__dirname, "..", "..", "scripts", "extension-engine.js"),
          path.join(target, ENGINE_FILE)
        ],
        { stdio: "inherit" }
      );
      fs.writeFileSync(
        path.join(target, "Info.plist"),
        extensionInfoPlist({
          targetName: props.targetName,
          appGroup: props.appGroup,
          version: mod.version ?? "1.0.0",
          buildNumber: mod.ios?.buildNumber ?? "1",
          cardPushTitles: readCardPushTitles(
            fs.readFileSync(path.join(__dirname, CARD_PUSH_TITLES_FILE), "utf8")
          ),
          engine: engineConfig(
            props.appGroup,
            mod.extra?.breezNetwork,
            process.env.EXPO_PUBLIC_BREEZ_API_KEY
          )
        })
      );
      fs.writeFileSync(
        path.join(target, `${props.targetName}.entitlements`),
        extensionEntitlementsPlist(props.appGroup)
      );
      return mod;
    }
  ]);

/**
 * Adds the extension's target to an Expo project (xcode 3, as Expo uses it): its files, build
 * phases and settings, embedded in the app. Once only: a project that has it is left as it is.
 */
export function addExtensionTarget(
  project: XcodeProject,
  props: CardNotificationExtensionProps,
  { version, buildNumber }: { version: string; buildNumber: string }
): void {
  const { targetName } = props;
  if (hasNativeTarget(project, targetName)) return;

  const objects = project.hash.project.objects;
  // xcode 3 adds a dependency to these sections, which a fresh Expo project lacks.
  objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};

  const group = project.addPbxGroup(
    [...SWIFT_FILES, ENGINE_FILE, "Info.plist", `${targetName}.entitlements`],
    targetName,
    targetName
  );
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);

  // An app extension: xcode 3 adds the app's dependency on it and a phase of the first target,
  // the app's in an Expo project, that copies it into the app's PlugIns.
  const target = project.addTarget(targetName, "app_extension", targetName, props.bundleIdentifier);
  project.addBuildPhase([...SWIFT_FILES], "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([ENGINE_FILE], "PBXResourcesBuildPhase", "Resources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
  embedAfterResources(project, targetName);
  // The extension's framework, in the app: the producer's output and the script are its inputs,
  // so that Xcode runs it after the extension's pods made it (SattlemeBreezSdkSparkFFI's "[CP] Copy
  // XCFrameworks"), and anew on each build.
  const embed = project.addBuildPhase(
    [],
    "PBXShellScriptBuildPhase",
    EMBED_PHASE,
    project.getFirstTarget().uuid,
    {
      shellPath: "/bin/sh",
      shellScript: `/bin/sh "\${SRCROOT}/${targetName}/${EMBED_SCRIPT}"`,
      inputPaths: [
        `"\${SRCROOT}/${targetName}/${EMBED_SCRIPT}"`,
        `"\${PODS_XCFRAMEWORKS_BUILD_DIR}/SattlemeBreezSdkSparkFFI/breez_sdk_sparkFFI.framework"`
      ],
      outputPaths: [
        `"\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}/breez_sdk_sparkFFI.framework"`
      ]
    }
  );
  embed.buildPhase.alwaysOutOfDate = 1;

  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const settings = configurations[key]?.buildSettings;
    if (!settings || settings.PRODUCT_NAME !== `"${targetName}"`) continue;
    settings.INFOPLIST_FILE = `${targetName}/Info.plist`;
    settings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
    settings.CODE_SIGN_STYLE = "Automatic";
    settings.IPHONEOS_DEPLOYMENT_TARGET = props.deploymentTarget;
    // iPhone and iPad, as the app (AGENTS.md hard rule 6).
    settings.TARGETED_DEVICE_FAMILY = `"1,2"`;
    settings.SWIFT_VERSION = "5.0";
    settings.CLANG_ENABLE_MODULES = "YES";
    settings.GENERATE_INFOPLIST_FILE = "NO";
    settings.MARKETING_VERSION = version;
    settings.CURRENT_PROJECT_VERSION = buildNumber;
  }
}

/**
 * Whether the project has a target of that name. Not xcode 3's `pbxTargetByName`: it compares
 * comments, and it writes the comment of a target it adds quoted, so it never finds that target.
 */
export function hasNativeTarget(project: XcodeProject, name: string): boolean {
  const targets: Record<string, unknown> = project.hash.project.objects.PBXNativeTarget ?? {};
  return Object.values(targets).some(
    (target) =>
      typeof target === "object" &&
      target !== null &&
      String((target as { name?: unknown }).name).replace(/^"(.*)"$/, "$1") === name
  );
}

/**
 * Moves the phase that copies the extension into the app right after the app's resources, before
 * its script phases (xcode 3 puts it last): the order Xcode itself gives a new extension, and the
 * one its "Cycle inside …" error, since Xcode 15, asks for when an extension is copied after
 * script phases.
 */
function embedAfterResources(project: XcodeProject, targetName: string): void {
  const objects = project.hash.project.objects;
  const phases: { value: string }[] = project.getFirstTarget().firstTarget.buildPhases;
  const product = `${targetName}.appex in Copy Files`;
  const embed = phases.findIndex(({ value }) =>
    (objects.PBXCopyFilesBuildPhase?.[value]?.files ?? []).some(
      (file: { comment?: string }) => file.comment === product
    )
  );
  const resources = phases.findIndex(({ value }) => objects.PBXResourcesBuildPhase?.[value]);
  if (embed === -1 || resources === -1) {
    throw new Error("The app target's resources or the extension's copy phase is missing");
  }
  const [phase] = phases.splice(embed, 1);
  phases.splice(resources + 1, 0, phase);
}

const withExtensionTarget: ConfigPlugin<CardNotificationExtensionProps> = (config, props) =>
  withXcodeProject(config, (mod) => {
    addExtensionTarget(mod.modResults, props, {
      version: mod.version ?? "1.0.0",
      buildNumber: mod.ios?.buildNumber ?? "1"
    });
    return mod;
  });

/**
 * The Podfile's target of the extension: the Breez SDK's Swift build only (its pods, pinned:
 * pods/), never the app's React Native modules.
 */
export function podfileTarget(targetName: string, podspecDir: string): string {
  const spec = (name: string) => `'${podspecDir}/${name}.podspec'`;
  return `
${PODFILE_MARK}
target '${targetName}' do
  pod 'SattlemeBigNumber', :podspec => ${spec("SattlemeBigNumber")}
  pod 'SattlemeBreezSdkSparkFFI', :podspec => ${spec("SattlemeBreezSdkSparkFFI")}
  pod 'SattlemeBreezSdkSpark', :podspec => ${spec("SattlemeBreezSdkSpark")}
end
`;
}

const withExtensionPods: ConfigPlugin<CardNotificationExtensionProps> = (config, props) =>
  withPodfile(config, (mod) => {
    if (mod.modResults.contents.includes(PODFILE_MARK)) return mod;
    // The Podfile is in ios/: the podspecs, relative to it.
    const podspecDir = path
      .relative(mod.modRequest.platformProjectRoot, path.join(__dirname, "pods"))
      .split(path.sep)
      .join("/");
    const target = podfileTarget(props.targetName, podspecDir);
    mod.modResults.contents = `${mod.modResults.contents.trimEnd()}\n${target}`;
    return mod;
  });

const withCardNotificationExtension: ConfigPlugin<CardNotificationExtensionProps> = (
  config,
  props
) => {
  const checked = checkProps(props, config.ios?.bundleIdentifier);
  config = withAppGroup(config, checked);
  config = withExtensionFiles(config, checked);
  config = withExtensionTarget(config, checked);
  return withExtensionPods(config, checked);
};

export default withCardNotificationExtension;
