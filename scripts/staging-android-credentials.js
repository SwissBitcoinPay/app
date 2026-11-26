// The staging Android app's signing key, for its EAS builds. "Protect credentials" is on for the
// Expo account: only a Release Manager reads the credentials EAS manages, and the staging robot, a Developer,
// would start builds that cannot sign. So the staging Android key is not EAS-managed: eas.json
// (profile staging, `android.credentialsSource: "local"`) has EAS read it from credentials.json,
// which this script writes on the EAS Build worker, from the EAS environment preview:
//
//   STAGING_ANDROID_KEYSTORE           the keystore, a secret *file* variable (EAS sets its path)
//   STAGING_ANDROID_KEYSTORE_PASSWORD  secret
//   STAGING_ANDROID_KEY_ALIAS          secret
//   STAGING_ANDROID_KEY_PASSWORD       secret, only for a key with a password of its own
//
// A keystore EAS generated has no key password (expo.dev shows "Android key password: null"):
// its key opens with the keystore's password. Then STAGING_ANDROID_KEY_PASSWORD is not created,
// credentials.json has no keyPassword, and EAS signs with the keystore's password (EAS CLI 24.8.0,
// credentialsJson/types.js: keyPassword optional; @expo/build-tools 27.10.0,
// EasBuildInjectAndroidCredentialsGradle: keystorePassword when keyPassword is absent).
//
// Secret variables are readable on EAS's servers only (Expo docs, "Environment variables"): no
// token reads them, not even `eas env:pull`. The production app's key stays EAS-managed and
// protected, never here.
//
// Run by the build job of .eas/workflows/deploy-staging.yml (hook after_install_node_modules),
// which runs before EAS reads the credentials (`eas build:internal`, @expo/build-tools 27.10.0,
// common/setup.js). Refuses anywhere but a staging EAS build. Never prints a value.
//
// EAS reads the keystore only to sign, at the end of the native build: a wrong value fails the
// build after about half an hour ("Keystore was tampered with, or password was incorrect").
// So the keystore is opened first, with keytool (the JDK of EAS's Android images, Expo docs
// "Build infrastructure"), as Gradle will: its key is read with the key password (the keystore's
// without one), which proves the file, both passwords and the alias. The passwords reach keytool
// through its environment (`-storepass:env`), never its arguments.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** Where EAS CLI reads local credentials: credentials.json at the project's root (git ignores it). */
const CREDENTIALS_FILE = path.join(__dirname, "..", "credentials.json");

const VARIABLES = {
  keystore: "STAGING_ANDROID_KEYSTORE",
  keystorePassword: "STAGING_ANDROID_KEYSTORE_PASSWORD",
  keyAlias: "STAGING_ANDROID_KEY_ALIAS",
  keyPassword: "STAGING_ANDROID_KEY_PASSWORD"
};

/** An optional variable's value, as set; undefined when it is not set. */
function optional(env, name) {
  const value = env[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is empty in the EAS environment preview: delete it or set it.`);
  }
  return value;
}

/** A required variable's value, as set. Throws, naming it only, when it is missing or empty. */
function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is not set in the EAS environment preview.`);
  }
  return value;
}

/**
 * credentials.json for the staging Android build (EAS CLI 24.8.0, credentials/credentialsJson:
 * `android.keystore`, the keystore's path absolute or relative to the project). Throws unless this
 * is a staging EAS build with every required value set and the keystore a non-empty file.
 */
function stagingAndroidCredentials(env, fileSize = (file) => fs.statSync(file).size) {
  // EAS_BUILD=true on EAS Build workers (Expo docs, "Built-in environment variables").
  if (!env.EAS_BUILD || env.APP_VARIANT !== "staging") {
    throw new Error("The staging Android credentials are written on a staging EAS build only.");
  }
  const keystorePath = required(env, VARIABLES.keystore);
  if (!path.isAbsolute(keystorePath)) {
    throw new Error(`${VARIABLES.keystore} is not a file variable (its value is not a path).`);
  }
  let size;
  try {
    size = fileSize(keystorePath);
  } catch {
    throw new Error(`${VARIABLES.keystore}: no file at its path.`);
  }
  if (size <= 0) throw new Error(`${VARIABLES.keystore}: the file is empty.`);
  const keyPassword = optional(env, VARIABLES.keyPassword);
  return {
    android: {
      keystore: {
        keystorePath,
        keystorePassword: required(env, VARIABLES.keystorePassword),
        keyAlias: required(env, VARIABLES.keyAlias),
        ...(keyPassword === undefined ? {} : { keyPassword })
      }
    }
  };
}

/** Runs keytool, the JDK's: JAVA_HOME's when set, else the one on PATH. Throws as execFileSync. */
function runKeytool(args, env) {
  const keytool = env.JAVA_HOME ? path.join(env.JAVA_HOME, "bin", "keytool") : "keytool";
  execFileSync(keytool, args, { env, stdio: "pipe", timeout: 60_000 });
}

/**
 * What keytool's failure says of the values (its English messages, LC_ALL=C; checked with OpenJDK
 * 21 on JKS and PKCS12 keystores), naming the variable to fix and never a value: its output, which
 * names the alias, is never shown.
 */
function keytoolFailure(error) {
  if (error && error.code === "ENOENT") {
    return "keytool was not found on the build worker: the keystore could not be checked.";
  }
  const output = `${error?.stdout ?? ""}${error?.stderr ?? ""}`;
  if (/password was incorrect/i.test(output)) {
    return `${VARIABLES.keystorePassword} does not open ${VARIABLES.keystore} (or the file is not that keystore).`;
  }
  if (/Alias <[^>]*> does not exist/i.test(output)) {
    return `${VARIABLES.keyAlias} is not an alias of ${VARIABLES.keystore}.`;
  }
  if (/Cannot recover key/i.test(output)) {
    return `The key's password does not open the key: set ${VARIABLES.keyPassword} to it (without it, the keystore's password is used).`;
  }
  if (/keystore format/i.test(output)) {
    return `${VARIABLES.keystore} is not a keystore keytool reads.`;
  }
  return `keytool could not read the key of ${VARIABLES.keystore} with these values (${VARIABLES.keystorePassword}, ${VARIABLES.keyAlias}, ${VARIABLES.keyPassword}).`;
}

/**
 * Throws, naming the variable to fix, unless the key opens as Gradle will open it: `keytool
 * -certreq` reads the keystore with its password and the key of the alias with the key password
 * (the keystore's without one). Its output, a certificate request, is dropped.
 */
function checkStagingAndroidKeystore(credentials, env, run = runKeytool) {
  const { keystorePath, keyAlias, keyPassword } = credentials.android.keystore;
  const args = [
    "-certreq",
    "-keystore",
    keystorePath,
    "-alias",
    keyAlias,
    `-storepass:env`,
    VARIABLES.keystorePassword,
    `-keypass:env`,
    keyPassword === undefined ? VARIABLES.keystorePassword : VARIABLES.keyPassword
  ];
  try {
    run(args, { ...env, LC_ALL: "C" });
  } catch (error) {
    throw new Error(keytoolFailure(error));
  }
}

/**
 * Writes credentials.json, readable by its owner only, never over an existing one, once its
 * keystore opened (checkStagingAndroidKeystore).
 */
function writeStagingAndroidCredentials(
  env,
  file = CREDENTIALS_FILE,
  check = checkStagingAndroidKeystore
) {
  const credentials = stagingAndroidCredentials(env);
  check(credentials, env);
  fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: "wx" });
  return file;
}

module.exports = {
  VARIABLES,
  stagingAndroidCredentials,
  checkStagingAndroidKeystore,
  writeStagingAndroidCredentials
};

if (require.main === module) {
  try {
    const file = writeStagingAndroidCredentials(process.env);
    console.log(`Wrote ${path.relative(process.cwd(), file)} for the staging Android build.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
