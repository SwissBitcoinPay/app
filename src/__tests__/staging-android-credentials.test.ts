// The staging Android app's signing key, given to its EAS builds by scripts/staging-android-credentials.js
// from secret variables of the EAS environment preview, while "Protect credentials" keeps the
// EAS-managed keys (production's) to Release Managers.

import easJson from "../../eas.json";
import { withEnv } from "../../jest/env";

type Credentials = {
  android: {
    keystore: {
      keystorePath: string;
      keystorePassword: string;
      keyAlias: string;
      keyPassword?: string;
    };
  };
};
type Env = Record<string, string | undefined>;
type Run = (args: string[], env: Env) => void;
const {
  VARIABLES,
  stagingAndroidCredentials,
  checkStagingAndroidKeystore,
  writeStagingAndroidCredentials
} = jest.requireActual<{
  VARIABLES: Record<keyof Credentials["android"]["keystore"] | "keystore", string>;
  stagingAndroidCredentials(env: Env, fileSize?: (file: string) => number): Credentials;
  checkStagingAndroidKeystore(credentials: Credentials, env: Env, run?: Run): void;
  writeStagingAndroidCredentials(
    env: Env,
    file?: string,
    check?: (credentials: Credentials, env: Env) => void
  ): string;
}>("../../scripts/staging-android-credentials.js");

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string): void;
  statSync(path: string): { mode: number };
  existsSync(path: string): boolean;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

const KEYSTORE = "/eas/env/STAGING_ANDROID_KEYSTORE";
const STAGING_BUILD: Env = {
  EAS_BUILD: "true",
  APP_VARIANT: "staging",
  STAGING_ANDROID_KEYSTORE: KEYSTORE,
  STAGING_ANDROID_KEYSTORE_PASSWORD: "store-password",
  STAGING_ANDROID_KEY_ALIAS: "key-alias",
  STAGING_ANDROID_KEY_PASSWORD: "key-password"
};
const aKeystore = () => 2048;
/** A keystore check that passes: keytool is not run by these tests. */
const opens = () => undefined;

describe("the staging Android credentials", () => {
  it("are the keystore and its passwords, as EAS CLI reads credentials.json", () => {
    expect(stagingAndroidCredentials(STAGING_BUILD, aKeystore)).toEqual({
      android: {
        keystore: {
          keystorePath: KEYSTORE,
          keystorePassword: "store-password",
          keyAlias: "key-alias",
          keyPassword: "key-password"
        }
      }
    });
  });

  it("are written on a staging EAS build only", () => {
    for (const env of [
      { ...STAGING_BUILD, EAS_BUILD: undefined },
      { ...STAGING_BUILD, APP_VARIANT: "production" },
      { ...STAGING_BUILD, APP_VARIANT: undefined }
    ]) {
      expect(() => stagingAndroidCredentials(env, aKeystore)).toThrow(
        "The staging Android credentials are written on a staging EAS build only."
      );
    }
  });

  // A keystore EAS generated has no key password of its own (expo.dev: "Android key password:
  // null"): EAS then signs with the keystore's password.
  it("leave the key password out when it is not set, as for a keystore EAS generated", () => {
    const credentials = stagingAndroidCredentials(
      { ...STAGING_BUILD, STAGING_ANDROID_KEY_PASSWORD: undefined },
      aKeystore
    );
    expect(credentials.android.keystore).toEqual({
      keystorePath: KEYSTORE,
      keystorePassword: "store-password",
      keyAlias: "key-alias"
    });
    expect("keyPassword" in credentials.android.keystore).toBe(false);
  });

  it("refuse a missing value, naming it and never showing one", () => {
    const required = [VARIABLES.keystore, VARIABLES.keystorePassword, VARIABLES.keyAlias];
    const cases = [
      ...required.flatMap((name) => [undefined, "", "  "].map((value) => ({ name, value }))),
      // The key password may be left out, never set empty.
      ...["", "  "].map((value) => ({ name: VARIABLES.keyPassword, value }))
    ];
    for (const { name, value } of cases) {
      let message = "";
      try {
        stagingAndroidCredentials({ ...STAGING_BUILD, [name]: value }, aKeystore);
      } catch (error) {
        message = (error as Error).message;
      }
      expect({ name, value, message: message.includes(name) }).toEqual({
        name,
        value,
        message: true
      });
      for (const secret of ["store-password", "key-alias", "key-password"]) {
        expect(message).not.toContain(secret);
      }
    }
  });

  // A secret file variable's value is the path EAS writes it to, outside the project.
  it("refuse a keystore that is not a file variable, or no file, or an empty one", () => {
    expect(() =>
      stagingAndroidCredentials({ ...STAGING_BUILD, STAGING_ANDROID_KEYSTORE: "MIIK…" }, aKeystore)
    ).toThrow("STAGING_ANDROID_KEYSTORE is not a file variable");
    expect(() =>
      stagingAndroidCredentials(STAGING_BUILD, () => {
        throw new Error("ENOENT");
      })
    ).toThrow("STAGING_ANDROID_KEYSTORE: no file at its path.");
    expect(() => stagingAndroidCredentials(STAGING_BUILD, () => 0)).toThrow(
      "STAGING_ANDROID_KEYSTORE: the file is empty."
    );
  });

  // As Gradle opens it: the keystore with its password, the key with the key password (the
  // keystore's without one). keytool's messages are its English ones (LC_ALL=C), checked with
  // OpenJDK 21 on JKS and PKCS12 keystores.
  describe("the keystore's check", () => {
    const credentials = (env: Env) => stagingAndroidCredentials(env, aKeystore);
    const failing = (output: string, code?: string) => () => {
      throw Object.assign(new Error("Command failed"), { code, stdout: output });
    };

    it("reads the key with keytool, the passwords through its environment only", () => {
      const run = jest.fn<void, Parameters<Run>>();
      checkStagingAndroidKeystore(credentials(STAGING_BUILD), STAGING_BUILD, run);
      const [args, env] = run.mock.calls[0];
      expect(args).toEqual([
        "-certreq",
        "-keystore",
        KEYSTORE,
        "-alias",
        "key-alias",
        "-storepass:env",
        "STAGING_ANDROID_KEYSTORE_PASSWORD",
        "-keypass:env",
        "STAGING_ANDROID_KEY_PASSWORD"
      ]);
      for (const secret of ["store-password", "key-password"]) {
        expect(args.join(" ")).not.toContain(secret);
      }
      expect(env).toMatchObject({ ...STAGING_BUILD, LC_ALL: "C" });
    });

    it("opens the key with the keystore's password when the key has none of its own", () => {
      const run = jest.fn<void, Parameters<Run>>();
      const env = { ...STAGING_BUILD, STAGING_ANDROID_KEY_PASSWORD: undefined };
      checkStagingAndroidKeystore(credentials(env), env, run);
      expect(run.mock.calls[0][0].slice(-2)).toEqual([
        "-keypass:env",
        "STAGING_ANDROID_KEYSTORE_PASSWORD"
      ]);
    });

    it("names the value to fix, never showing keytool's output", () => {
      const cases: [string, string][] = [
        [
          "keytool error: java.io.IOException: Keystore was tampered with, or password was incorrect",
          "STAGING_ANDROID_KEYSTORE_PASSWORD does not open STAGING_ANDROID_KEYSTORE"
        ],
        [
          "keytool error: java.io.IOException: keystore password was incorrect",
          "STAGING_ANDROID_KEYSTORE_PASSWORD does not open STAGING_ANDROID_KEYSTORE"
        ],
        [
          "keytool error: java.lang.Exception: Alias <key-alias> does not exist",
          "STAGING_ANDROID_KEY_ALIAS is not an alias of STAGING_ANDROID_KEYSTORE."
        ],
        [
          "keytool error: java.security.UnrecoverableKeyException: Cannot recover key",
          "set STAGING_ANDROID_KEY_PASSWORD to it"
        ],
        [
          "keytool error: java.security.KeyStoreException: Unrecognized keystore format.",
          "STAGING_ANDROID_KEYSTORE is not a keystore keytool reads."
        ],
        ["something else", "keytool could not read the key of STAGING_ANDROID_KEYSTORE"]
      ];
      for (const [output, expected] of cases) {
        let message = "";
        try {
          checkStagingAndroidKeystore(credentials(STAGING_BUILD), STAGING_BUILD, failing(output));
        } catch (error) {
          message = (error as Error).message;
        }
        expect({ output, has: message.includes(expected) }).toEqual({ output, has: true });
        expect(message).not.toContain("key-alias");
        expect(message).not.toContain("keytool error");
      }
    });

    it("says so when keytool is not on the build worker", () => {
      expect(() =>
        checkStagingAndroidKeystore(
          credentials(STAGING_BUILD),
          STAGING_BUILD,
          failing("", "ENOENT")
        )
      ).toThrow("keytool was not found on the build worker");
    });
  });

  describe("credentials.json", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(join(tmpdir(), "staging-credentials-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("is written for its owner only, and never over an existing one", () => {
      const keystore = join(dir, "keystore");
      fs.writeFileSync(keystore, "keystore bytes");
      const file = join(dir, "credentials.json");
      withEnv({}, () =>
        writeStagingAndroidCredentials(
          { ...STAGING_BUILD, STAGING_ANDROID_KEYSTORE: keystore },
          file,
          opens
        )
      );
      const written = JSON.parse(fs.readFileSync(file, "utf8")) as Credentials;
      expect(written.android.keystore.keystorePath).toBe(keystore);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);

      expect(() =>
        writeStagingAndroidCredentials(
          { ...STAGING_BUILD, STAGING_ANDROID_KEYSTORE: keystore },
          file,
          opens
        )
      ).toThrow(/EEXIST/);
    });

    // A keystore that does not open is never handed to EAS: the build stops before its native part.
    it("is not written when the keystore does not open", () => {
      const keystore = join(dir, "keystore");
      fs.writeFileSync(keystore, "keystore bytes");
      const file = join(dir, "credentials.json");
      expect(() =>
        writeStagingAndroidCredentials(
          { ...STAGING_BUILD, STAGING_ANDROID_KEYSTORE: keystore },
          file,
          () => {
            throw new Error(
              "STAGING_ANDROID_KEYSTORE_PASSWORD does not open STAGING_ANDROID_KEYSTORE"
            );
          }
        )
      ).toThrow("STAGING_ANDROID_KEYSTORE_PASSWORD does not open");
      expect(fs.existsSync(file)).toBe(false);
    });

    it("stays out of git", () => {
      const ignored = fs.readFileSync(".gitignore", "utf8").split("\n");
      expect(ignored).toContain("credentials.json");
    });
  });
});

// Only the staging apps' credentials are local, Android's and iOS's (staging-ios-credentials.js):
// the production apps' (the v2 app's upload key, the App Store's certificate) stay
// EAS-managed, protected.
describe("eas.json's credentials", () => {
  type Source = { credentialsSource?: string };
  type Profile = Source & { android?: Source; ios?: Source };
  const build = easJson.build as Record<string, Profile>;

  it("are local for the staging apps only", () => {
    expect(build.staging.android?.credentialsSource).toBe("local");
    expect(build.staging.ios?.credentialsSource).toBe("local");
    expect(build.staging.credentialsSource).toBeUndefined();
    for (const [name, profile] of Object.entries(build).filter(([name]) => name !== "staging")) {
      expect({
        name,
        sources: [profile, profile.android, profile.ios].map((part) => part?.credentialsSource)
      }).toEqual({
        name,
        sources: [undefined, undefined, undefined]
      });
    }
  });

  it("are written by the staging build job, and by no other", () => {
    const staging = fs.readFileSync(".eas/workflows/deploy-staging.yml", "utf8");
    const release = fs.readFileSync(".eas/workflows/release-production.yml", "utf8");
    const buildJob = staging.slice(
      staging.indexOf("  build_android:"),
      staging.indexOf("  update_android:")
    );
    expect(buildJob).toContain("platform: android");
    expect(buildJob).toMatch(
      /after_install_node_modules:\n[\s\S]*run: node scripts\/staging-android-credentials\.js\n/
    );
    expect(staging.match(/staging-android-credentials/g)).toHaveLength(1);
    expect(release).not.toContain("staging-android-credentials");
  });
});
