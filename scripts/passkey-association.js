// Association files of the passkey RP domain: the web app of each
// variant serves them, its host being the variant's RP ID. They also let the app open the web
// app's links (universal links and App Links), when the app config claims
// them. The export-web jobs of .github/workflows/deploy-staging.yml and release-production.yml run
// this script before their web export: it writes them into public/.well-known/, which the export
// copies. Never committed (.gitignore): their data comes from the EAS environment of the deploy
// (read by the job before, scripts/eas-public-env.js), the app ids and the RP ID from the app
// config (app.config.ts, APP_VARIANT and PASSKEY_RP_ID).
//
//   PASSKEY_APPLE_TEAM_ID        Apple Developer Team ID of the iOS app (10 characters)
//   PASSKEY_ANDROID_CERT_SHA256  SHA-256 fingerprints of the Android app's signing certificates,
//                                comma-separated (AA:BB:…:FF, 32 bytes each)
//
// Run by hand: APP_VARIANT=… PASSKEY_RP_ID=… PASSKEY_APPLE_TEAM_ID=… PASSKEY_ANDROID_CERT_SHA256=…
// node scripts/passkey-association.js (it reads no .env file).
//
// With --check, it writes nothing: it reads the files the RP ID's host serves and fails unless they
// let the variant's apps use its passkeys (checkServedAssociationFiles). The production release
// runs it once the web app is deployed, before the Android app is submitted (the submit job's
// before_submit hook, .eas/workflows/release-production.yml): APP_VARIANT=… PASSKEY_RP_ID=… node
// scripts/passkey-association.js --check
const fs = require("node:fs");
const path = require("node:path");

/** Where the web export picks them up: Expo CLI copies public/ into the export as is. */
const OUTPUT_DIR = path.join(__dirname, "..", "public", ".well-known");

/** An Apple Developer Team ID: 10 uppercase letters or digits. */
const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;

/** A SHA-256 certificate fingerprint as Android prints it: 32 hex bytes separated by colons. */
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/i;

/** The value of a required variable, trimmed. Throws when it is missing or empty. */
function requireVariable(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function parseAppleTeamId(value) {
  if (!APPLE_TEAM_ID.test(value)) {
    throw new Error(
      `PASSKEY_APPLE_TEAM_ID "${value}" is not an Apple Team ID: 10 uppercase letters or digits.`
    );
  }
  return value;
}

/**
 * The certificate of the debug key that the React Native and Expo templates publish on npm
 * (android/app/debug.keystore, password "android"; the same in
 * expo-template-bare-minimum 58.0.32 and @react-native-community/template 0.88.1). Anyone can sign
 * with it: listed here, any clone of the app built under the same package name, outside Google
 * Play, could use the passkeys of the RP ID, so derive the wallets of this variant's users. The
 * app's own debug builds (`npm run android`) are signed with it: they never get these passkeys.
 */
const PUBLIC_DEBUG_FINGERPRINT =
  "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";

/** The fingerprints of a comma-separated list, in uppercase as in Android's own tools. */
function parseCertFingerprints(value) {
  return value.split(",").map((entry) => {
    const fingerprint = entry.trim();
    if (!SHA256_FINGERPRINT.test(fingerprint)) {
      throw new Error(
        `PASSKEY_ANDROID_CERT_SHA256: "${fingerprint}" is not a SHA-256 certificate fingerprint ` +
          `(32 hex bytes separated by colons).`
      );
    }
    const upper = fingerprint.toUpperCase();
    if (upper === PUBLIC_DEBUG_FINGERPRINT) {
      throw new Error(
        `PASSKEY_ANDROID_CERT_SHA256: "${upper}" is the public debug key of the React Native and ` +
          `Expo templates, with which anyone signs an app: never list it.`
      );
    }
    return upper;
  });
}

/**
 * Whether the iOS app claims the links of `host` (`applinks:<host>` in ios.associatedDomains): the
 * RP ID's, not another's the app claims too (the v2 cards' printed links, whose host serves its own
 * files).
 */
function iosOpensLinks(exp, host) {
  return (exp.ios?.associatedDomains ?? []).includes(`applinks:${host}`);
}

/**
 * Whether the Android app claims the links of `host` (an `autoVerify` intent filter naming it, App
 * Links), as iosOpensLinks.
 */
function androidOpensLinks(exp, host) {
  return (exp.android?.intentFilters ?? []).some(
    (filter) => filter.autoVerify === true && (filter.data ?? []).some((data) => data.host === host)
  );
}

/**
 * The files, by name, for an app config (`exp`, as `expo config` resolves it) and the environment:
 * - apple-app-site-association: the iOS app may use the passkeys of the domain (`webcredentials`)
 *   and, when it claims them, opens every page of the web app (`applinks`, universal links);
 * - assetlinks.json: the Android app may (`delegate_permission/common.get_login_creds`) and, when
 *   it claims them, opens every page of the web app (`delegate_permission/common.handle_all_urls`,
 *   App Links), as a second statement for the same app.
 * The links are those of the web app, which serves these files on the RP ID's host (`linkHost` in
 * app.config.ts: every variant, when an RP ID is set). Both are JSON. The first has no extension:
 * EAS CLI serves such a file as application/json when its content is JSON (eas-cli,
 * worker/assets.js), as Apple and the WebAuthn spec expect.
 */
function passkeyAssociationFiles(exp, env) {
  const rpId = exp.extra?.passkeyRpId;
  if (!rpId) {
    throw new Error("PASSKEY_RP_ID is not set.");
  }
  const bundleIdentifier = exp.ios?.bundleIdentifier;
  const androidPackage = exp.android?.package;
  if (!bundleIdentifier || !androidPackage) {
    throw new Error("The app config has no ios.bundleIdentifier or android.package.");
  }
  const teamId = parseAppleTeamId(requireVariable(env, "PASSKEY_APPLE_TEAM_ID"));
  const fingerprints = parseCertFingerprints(requireVariable(env, "PASSKEY_ANDROID_CERT_SHA256"));

  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const iosApp = `${teamId}.${bundleIdentifier}`;
  const androidApp = {
    namespace: "android_app",
    package_name: androidPackage,
    sha256_cert_fingerprints: fingerprints
  };
  return {
    "apple-app-site-association": json({
      webcredentials: { apps: [iosApp] },
      ...(iosOpensLinks(exp, rpId)
        ? {
            applinks: {
              details: [
                {
                  appIDs: [iosApp],
                  components: [{ "/": "/*", comment: "Every page of the web app opens the app" }]
                }
              ]
            }
          }
        : {})
    }),
    "assetlinks.json": json([
      { relation: ["delegate_permission/common.get_login_creds"], target: androidApp },
      ...(androidOpensLinks(exp, rpId)
        ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: androidApp }]
        : [])
    ])
  };
}

/** Writes the files of `exp` and `env` into `outputDir`; returns their names. */
function writePasskeyAssociationFiles(exp, env, outputDir = OUTPUT_DIR) {
  const files = passkeyAssociationFiles(exp, env);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, name), content);
  }
  return Object.keys(files);
}

/**
 * The JSON of `name` as the RP ID's host serves it: HTTP 200 straight away (Apple and Android
 * follow no redirect), `application/json`, as the files must be served. Throws otherwise.
 */
async function readServedFile(rpId, name, fetchImpl) {
  const url = `https://${rpId}/.well-known/${name}`;
  const response = await fetchImpl(url, { redirect: "manual", cache: "no-store" });
  if (response.status !== 200) {
    throw new Error(`${url}: HTTP ${response.status}, expected 200 without redirect.`);
  }
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new Error(`${url}: served as "${type}", expected application/json.`);
  }
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error(`${url}: not JSON.`);
  }
}

/**
 * Checks the association files the RP ID's host serves for an app config (`exp`): the variant's
 * iOS app (`<Team ID>.<bundle id>`) and Android app (its package, with signing certificates that
 * are never the public debug key's) may use the passkeys, and open the web app's links when the
 * app claims them. Their Team ID and fingerprints are not checked against the EAS environment's:
 * they are checked when the files are written, from that environment, by the deploy that serves
 * them.
 * Throws on the first file that would not let them; `fetchImpl` is the global fetch but in tests.
 */
async function checkServedAssociationFiles(exp, fetchImpl = fetch) {
  const rpId = exp.extra?.passkeyRpId;
  if (!rpId) {
    throw new Error("PASSKEY_RP_ID is not set.");
  }
  const bundleIdentifier = exp.ios?.bundleIdentifier;
  const androidPackage = exp.android?.package;
  if (!bundleIdentifier || !androidPackage) {
    throw new Error("The app config has no ios.bundleIdentifier or android.package.");
  }
  const base = `https://${rpId}/.well-known`;

  const apple = await readServedFile(rpId, "apple-app-site-association", fetchImpl);
  const apps = apple?.webcredentials?.apps;
  const iosApp = (Array.isArray(apps) ? apps : []).find(
    (app) =>
      typeof app === "string" &&
      app.endsWith(`.${bundleIdentifier}`) &&
      APPLE_TEAM_ID.test(app.slice(0, -bundleIdentifier.length - 1))
  );
  if (!iosApp) {
    throw new Error(`${base}/apple-app-site-association: no <Team ID>.${bundleIdentifier}.`);
  }
  if (iosOpensLinks(exp, rpId)) {
    const details = apple?.applinks?.details;
    const opens = (Array.isArray(details) ? details : []).some(
      (detail) => Array.isArray(detail?.appIDs) && detail.appIDs.includes(iosApp)
    );
    if (!opens) {
      throw new Error(`${base}/apple-app-site-association: no applinks for ${iosApp}.`);
    }
  }

  const statements = await readServedFile(rpId, "assetlinks.json", fetchImpl);
  const grants = (relation) =>
    (Array.isArray(statements) ? statements : []).some((statement) => {
      const target = statement?.target;
      const fingerprints = target?.sha256_cert_fingerprints;
      return (
        Array.isArray(statement?.relation) &&
        statement.relation.includes(relation) &&
        target?.namespace === "android_app" &&
        target.package_name === androidPackage &&
        Array.isArray(fingerprints) &&
        fingerprints.length > 0 &&
        fingerprints.every(
          (fingerprint) =>
            typeof fingerprint === "string" &&
            SHA256_FINGERPRINT.test(fingerprint) &&
            fingerprint.toUpperCase() !== PUBLIC_DEBUG_FINGERPRINT
        )
      );
    });
  if (!grants("delegate_permission/common.get_login_creds")) {
    throw new Error(`${base}/assetlinks.json: no passkeys for ${androidPackage}.`);
  }
  if (androidOpensLinks(exp, rpId) && !grants("delegate_permission/common.handle_all_urls")) {
    throw new Error(`${base}/assetlinks.json: no App Links for ${androidPackage}.`);
  }
  return rpId;
}

/** The public app config, as the web export inlines it (same call as metro.config.js). */
function appConfig() {
  const { getConfig } = require("expo/config");
  return getConfig(path.join(__dirname, ".."), {
    isPublicConfig: true,
    skipSDKVersionRequirement: true
  }).exp;
}

/** Attempts of --check, 15 s apart: a deploy just made may take a moment to be served. */
const CHECK_ATTEMPTS = 8;
const CHECK_INTERVAL_MS = 15_000;
/** Longest wait for one file: a host that never answers fails the attempt. */
const CHECK_REQUEST_TIMEOUT_MS = 20_000;

async function check() {
  const exp = appConfig();
  for (let attempt = 1; ; attempt++) {
    try {
      const rpId = await checkServedAssociationFiles(exp, (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(CHECK_REQUEST_TIMEOUT_MS) })
      );
      console.log(`https://${rpId}/.well-known/ serves the association files of this variant.`);
      return;
    } catch (error) {
      if (attempt >= CHECK_ATTEMPTS) throw error;
      console.log(`Attempt ${attempt}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
  }
}

function write() {
  const exp = appConfig();
  const names = writePasskeyAssociationFiles(exp, process.env);
  console.log(
    `Wrote ${names.join(", ")} into ${path.relative(process.cwd(), OUTPUT_DIR)}: to be served at ` +
      `https://${exp.extra.passkeyRpId}/.well-known/`
  );
}

module.exports = {
  passkeyAssociationFiles,
  writePasskeyAssociationFiles,
  checkServedAssociationFiles
};

if (require.main === module) {
  Promise.resolve()
    .then(() => (process.argv.includes("--check") ? check() : write()))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
