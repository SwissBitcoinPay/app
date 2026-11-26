// The staging iOS app's signing credentials, for its EAS builds. "Protect credentials" is on for
// the Expo account: only a Release Manager reads the credentials EAS manages, and the staging
// robot, a Developer, would start iOS builds that cannot sign ("Reading this credential
// requires the Release Manager role or higher"). So, as for Android
// (staging-android-credentials.js), eas.json (profile staging, `ios.credentialsSource: "local"`)
// has EAS read them from credentials.json, which this script writes on the EAS Build worker, from
// the EAS environment preview:
//
//   STAGING_IOS_DIST_CERT              the distribution certificate (.p12), a secret *file*
//                                      variable (EAS sets its path); the staging app's own, never
//                                      the production app's
//   STAGING_IOS_DIST_CERT_PASSWORD     secret, the .p12's password
//   STAGING_IOS_PROVISIONING_PROFILE   the app's ad hoc provisioning profile (.mobileprovision),
//                                      a secret *file* variable, with the devices that may install
//   STAGING_IOS_CARD_EXTENSION_PROVISIONING_PROFILE
//                                      the card notification extension's ad hoc provisioning
//                                      profile, a secret *file* variable: its own bundle
//                                      identifier, the same certificate and devices as the app's
//
// The format is Expo's for a project with app extensions ("Local credentials", "Multi-target
// project": one entry per Xcode target, by its name, each with `provisioningProfilePath` and
// `distributionCertificate.path` and `.password`, paths absolute or relative to the project). The
// staging app has the card notification extension (app.config.ts, `cardExtension`): two targets,
// signed with the same distribution certificate. Secret variables are readable on EAS's servers
// only (Expo docs, "Environment variables"): no token reads them, not even `eas env:pull`. The
// production app's credentials stay EAS-managed and protected, never here.
//
// Run by the build_ios job of .eas/workflows/deploy-staging.yml (hook after_install_node_modules),
// before EAS reads the credentials, as the Android one. Refuses anywhere but a staging iOS EAS
// build. Never prints a value.
const fs = require("node:fs");
const path = require("node:path");

/** Where EAS CLI reads local credentials: credentials.json at the project's root (git ignores it). */
const CREDENTIALS_FILE = path.join(__dirname, "..", "credentials.json");

const VARIABLES = {
  certificate: "STAGING_IOS_DIST_CERT",
  certificatePassword: "STAGING_IOS_DIST_CERT_PASSWORD",
  profile: "STAGING_IOS_PROVISIONING_PROFILE",
  cardExtensionProfile: "STAGING_IOS_CARD_EXTENSION_PROVISIONING_PROFILE"
};

/**
 * The Xcode targets of the staging app, by the names prebuild gives them: the app's, from its name
 * (app.config.ts, APP_NAME, as @expo/config-plugins' sanitizedName makes it), and the card
 * notification extension's (app.config.ts, cardNotificationExtension). staging-ios-credentials.test.ts
 * keeps them equal to the config's.
 */
const TARGETS = { app: "sattleme", cardExtension: "CardNotificationService" };

/** A required variable's value, as set. Throws, naming it only, when it is missing or empty. */
function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is not set in the EAS environment preview.`);
  }
  return value;
}

/** The path a secret file variable gives: absolute, to a non-empty file. */
function requiredFile(env, name, fileSize) {
  const file = required(env, name);
  if (!path.isAbsolute(file)) {
    throw new Error(`${name} is not a file variable (its value is not a path).`);
  }
  let size;
  try {
    size = fileSize(file);
  } catch {
    throw new Error(`${name}: no file at its path.`);
  }
  if (size <= 0) throw new Error(`${name}: the file is empty.`);
  return file;
}

/**
 * credentials.json for the staging iOS build. Throws unless this is a staging iOS EAS build
 * (EAS_BUILD, EAS_BUILD_PLATFORM: Expo docs, "Environment variables", built-in ones) with every
 * value set and both files non-empty.
 */
function stagingIosCredentials(env, fileSize = (file) => fs.statSync(file).size) {
  if (!env.EAS_BUILD || env.EAS_BUILD_PLATFORM !== "ios" || env.APP_VARIANT !== "staging") {
    throw new Error("The staging iOS credentials are written on a staging iOS EAS build only.");
  }
  const distributionCertificate = {
    path: requiredFile(env, VARIABLES.certificate, fileSize),
    password: required(env, VARIABLES.certificatePassword)
  };
  return {
    ios: {
      [TARGETS.app]: {
        provisioningProfilePath: requiredFile(env, VARIABLES.profile, fileSize),
        distributionCertificate
      },
      [TARGETS.cardExtension]: {
        provisioningProfilePath: requiredFile(env, VARIABLES.cardExtensionProfile, fileSize),
        distributionCertificate
      }
    }
  };
}

/** Writes credentials.json, readable by its owner only; never over an existing one. */
function writeStagingIosCredentials(env, file = CREDENTIALS_FILE) {
  const credentials = stagingIosCredentials(env);
  fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: "wx" });
  return file;
}

module.exports = { VARIABLES, TARGETS, stagingIosCredentials, writeStagingIosCredentials };

if (require.main === module) {
  try {
    const file = writeStagingIosCredentials(process.env);
    console.log(`Wrote ${path.relative(process.cwd(), file)} for the staging iOS build.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
