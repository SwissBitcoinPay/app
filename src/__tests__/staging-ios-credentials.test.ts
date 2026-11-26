// The staging iOS app's signing credentials, given to its EAS builds by
// scripts/staging-ios-credentials.js from secret variables of the EAS environment preview, while
// "Protect credentials" keeps the EAS-managed ones (production's) to Release Managers.

import { IOSConfig } from "expo/config-plugins";

import appConfig, { cardNotificationExtension } from "../../app.config";
import { withEnv } from "../../jest/env";

type Target = {
  provisioningProfilePath: string;
  distributionCertificate: { path: string; password: string };
};
type Credentials = { ios: Record<string, Target> };
type Env = Record<string, string | undefined>;
const { VARIABLES, TARGETS, stagingIosCredentials, writeStagingIosCredentials } =
  jest.requireActual<{
    VARIABLES: Record<
      "certificate" | "certificatePassword" | "profile" | "cardExtensionProfile",
      string
    >;
    TARGETS: Record<"app" | "cardExtension", string>;
    stagingIosCredentials(env: Env, fileSize?: (file: string) => number): Credentials;
    writeStagingIosCredentials(env: Env, file?: string): string;
  }>("../../scripts/staging-ios-credentials.js");

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string): void;
  statSync(path: string): { mode: number };
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

const CERTIFICATE = "/eas/env/STAGING_IOS_DIST_CERT";
const PROFILE = "/eas/env/STAGING_IOS_PROVISIONING_PROFILE";
const EXTENSION_PROFILE = "/eas/env/STAGING_IOS_CARD_EXTENSION_PROVISIONING_PROFILE";
const STAGING_IOS_BUILD: Env = {
  EAS_BUILD: "true",
  EAS_BUILD_PLATFORM: "ios",
  APP_VARIANT: "staging",
  STAGING_IOS_DIST_CERT: CERTIFICATE,
  STAGING_IOS_DIST_CERT_PASSWORD: "p12-password",
  STAGING_IOS_PROVISIONING_PROFILE: PROFILE,
  STAGING_IOS_CARD_EXTENSION_PROVISIONING_PROFILE: EXTENSION_PROFILE
};
const aFile = () => 4096;

describe("the staging iOS credentials", () => {
  // One entry per Xcode target, by its name (Expo, "Local credentials", "Multi-target project"):
  // each its own profile, both the same certificate.
  it("are each target's profile with the certificate and its password, as EAS CLI reads them", () => {
    const distributionCertificate = { path: CERTIFICATE, password: "p12-password" };
    expect(stagingIosCredentials(STAGING_IOS_BUILD, aFile)).toEqual({
      ios: {
        sattleme: { provisioningProfilePath: PROFILE, distributionCertificate },
        CardNotificationService: {
          provisioningProfilePath: EXTENSION_PROFILE,
          distributionCertificate
        }
      }
    });
  });

  // EAS matches each entry to an Xcode target by name: prebuild names the app's target from the
  // app's name, the extension's from the config plugin's props. A target without credentials
  // stops the build ("Credentials for target … are not defined in credentials.json").
  it("name the staging app's Xcode targets as prebuild makes them", () => {
    const staging = withEnv({ APP_VARIANT: "staging", EAS_BUILD: undefined }, () =>
      appConfig({ config: {} } as Parameters<typeof appConfig>[0])
    );
    expect(TARGETS.app).toBe(IOSConfig.XcodeUtils.sanitizedName(staging.name));
    expect(TARGETS.cardExtension).toBe(
      cardNotificationExtension(staging.ios?.bundleIdentifier ?? "").targetName
    );
    expect(staging.plugins).toContainEqual([
      "./plugins/card-notification-extension/app.plugin",
      expect.objectContaining({ targetName: TARGETS.cardExtension })
    ]);
  });

  it("are written on a staging iOS EAS build only", () => {
    for (const env of [
      { ...STAGING_IOS_BUILD, EAS_BUILD: undefined },
      { ...STAGING_IOS_BUILD, EAS_BUILD_PLATFORM: "android" },
      { ...STAGING_IOS_BUILD, EAS_BUILD_PLATFORM: undefined },
      { ...STAGING_IOS_BUILD, APP_VARIANT: "production" },
      { ...STAGING_IOS_BUILD, APP_VARIANT: undefined }
    ]) {
      expect(() => stagingIosCredentials(env, aFile)).toThrow(
        "The staging iOS credentials are written on a staging iOS EAS build only."
      );
    }
  });

  it("refuse a missing value, naming it and never showing one", () => {
    for (const name of Object.values(VARIABLES)) {
      for (const value of [undefined, "", "  "]) {
        let message = "";
        try {
          stagingIosCredentials({ ...STAGING_IOS_BUILD, [name]: value }, aFile);
        } catch (error) {
          message = (error as Error).message;
        }
        expect({ name, value, named: message.includes(name) }).toEqual({
          name,
          value,
          named: true
        });
        expect(message).not.toContain("p12-password");
      }
    }
  });

  // A secret file variable's value is the path EAS writes it to, outside the project.
  it("refuse a certificate or a profile that is not a file variable, or no file, or an empty one", () => {
    for (const name of [VARIABLES.certificate, VARIABLES.profile, VARIABLES.cardExtensionProfile]) {
      expect(() => stagingIosCredentials({ ...STAGING_IOS_BUILD, [name]: "MIIK…" }, aFile)).toThrow(
        `${name} is not a file variable`
      );
      expect(() =>
        stagingIosCredentials(STAGING_IOS_BUILD, (file) => {
          if (file === STAGING_IOS_BUILD[name]) throw new Error("ENOENT");
          return 4096;
        })
      ).toThrow(`${name}: no file at its path.`);
      expect(() =>
        stagingIosCredentials(STAGING_IOS_BUILD, (file) =>
          file === STAGING_IOS_BUILD[name] ? 0 : 4096
        )
      ).toThrow(`${name}: the file is empty.`);
    }
  });

  describe("credentials.json", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(join(tmpdir(), "staging-ios-credentials-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("is written for its owner only, and never over an existing one", () => {
      const certificate = join(dir, "dist.p12");
      const profile = join(dir, "profile.mobileprovision");
      const extensionProfile = join(dir, "extension.mobileprovision");
      fs.writeFileSync(certificate, "p12 bytes");
      fs.writeFileSync(profile, "profile bytes");
      fs.writeFileSync(extensionProfile, "extension profile bytes");
      const env = {
        ...STAGING_IOS_BUILD,
        STAGING_IOS_DIST_CERT: certificate,
        STAGING_IOS_PROVISIONING_PROFILE: profile,
        STAGING_IOS_CARD_EXTENSION_PROVISIONING_PROFILE: extensionProfile
      };
      const file = join(dir, "credentials.json");
      withEnv({}, () => writeStagingIosCredentials(env, file));
      const written = JSON.parse(fs.readFileSync(file, "utf8")) as Credentials;
      expect(written.ios[TARGETS.app].distributionCertificate.path).toBe(certificate);
      expect(written.ios[TARGETS.app].provisioningProfilePath).toBe(profile);
      expect(written.ios[TARGETS.cardExtension].distributionCertificate.path).toBe(certificate);
      expect(written.ios[TARGETS.cardExtension].provisioningProfilePath).toBe(extensionProfile);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(() => writeStagingIosCredentials(env, file)).toThrow(/EEXIST/);
    });
  });
});

describe("the staging iOS build", () => {
  // Written by the iOS build job only: the Android one has its own (staging-android-credentials.js),
  // production none.
  it("writes the credentials in its own job, and no other job does", () => {
    const staging = fs.readFileSync(".eas/workflows/deploy-staging.yml", "utf8");
    const release = fs.readFileSync(".eas/workflows/release-production.yml", "utf8");
    const buildJob = staging.slice(
      staging.indexOf("  build_ios:"),
      staging.indexOf("  update_ios:")
    );
    expect(buildJob).toContain("platform: ios");
    expect(buildJob).toMatch(
      /after_install_node_modules:\n[\s\S]*run: node scripts\/staging-ios-credentials\.js\n/
    );
    expect(staging.match(/staging-ios-credentials/g)).toHaveLength(1);
    expect(release).not.toContain("staging-ios-credentials");
  });
});
