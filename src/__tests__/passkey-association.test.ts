import type { ExpoConfig } from "expo/config";

import appConfig from "../../app.config";
import { withEnv } from "../../jest/env";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs is
// typed here, as in app-config.test.ts.
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

type Env = Record<string, string | undefined>;
type Served = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};
type FetchServed = (url: string, init: { redirect: string; cache: string }) => Promise<Served>;
const { passkeyAssociationFiles, writePasskeyAssociationFiles, checkServedAssociationFiles } =
  jest.requireActual<{
    passkeyAssociationFiles(exp: ExpoConfig, env: Env): Record<string, string>;
    writePasskeyAssociationFiles(exp: ExpoConfig, env: Env, outputDir: string): string[];
    checkServedAssociationFiles(exp: ExpoConfig, fetchImpl: FetchServed): Promise<string>;
  }>("../../scripts/passkey-association.js");

// Test values: Apple's documentation example Team ID, made-up certificate fingerprints.
const TEAM_ID = "ABCDE12345";
const FINGERPRINT_A = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0"))
  .join(":")
  .toUpperCase();
const FINGERPRINT_B = Array(32).fill("AB").join(":");

/** The certificate of the templates' public debug key (anyone signs with it): see below. */
const PUBLIC_DEBUG_FINGERPRINT =
  "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";

const env: Env = { PASSKEY_APPLE_TEAM_ID: TEAM_ID, PASSKEY_ANDROID_CERT_SHA256: FINGERPRINT_A };

/**
 * The app config of a variant, as the deploy resolves it, with this RP ID (null: not set). Outside
 * EAS Build: there, the app config itself would refuse a missing RP ID before the script sees it.
 */
function configOf(variant: string, rpId: string | null = "passkeys.example.com"): ExpoConfig {
  return withEnv(
    { APP_VARIANT: variant, PASSKEY_RP_ID: rpId ?? undefined, EAS_BUILD: undefined },
    () => appConfig({ config: {} } as Parameters<typeof appConfig>[0])
  );
}

/**
 * `config` without the links of its own web app's host: an app that claims none of that host's
 * pages, whose files must then claim none either.
 */
function withoutWebAppLinks(config: ExpoConfig): ExpoConfig {
  const host = config.extra?.passkeyRpId;
  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: config.ios?.associatedDomains?.filter((d) => d !== `applinks:${host}`)
    },
    android: {
      ...config.android,
      intentFilters: config.android?.intentFilters?.filter(
        (filter) => ![filter.data ?? []].flat().some((data) => data.host === host)
      )
    }
  };
}

describe("passkey association files", () => {
  // Apple: Shared Web Credentials (passkeys) of the domain, for "<Team ID>.<bundle id>".
  it("lets the iOS app of the variant use the passkeys of the RP domain", () => {
    for (const variant of ["staging", "production"]) {
      const config = configOf(variant);
      const files = passkeyAssociationFiles(config, env);

      expect(JSON.parse(files["apple-app-site-association"]).webcredentials).toEqual({
        apps: [`${TEAM_ID}.${config.ios?.bundleIdentifier}`]
      });
    }
  });

  // Every page of a variant's web app opens in its app when it is installed (production too, its
  // web app being on its RP ID's host): universal links on iOS, App Links on Android, from the
  // same files.
  it("lets the app of every variant open every page of its web app", () => {
    for (const variant of ["staging", "production"]) {
      const config = configOf(variant, "web.example");
      const files = passkeyAssociationFiles(config, env);
      const iosApp = `${TEAM_ID}.${config.ios?.bundleIdentifier}`;
      const androidApp = {
        namespace: "android_app",
        package_name: config.android?.package,
        sha256_cert_fingerprints: [FINGERPRINT_A]
      };

      expect(JSON.parse(files["apple-app-site-association"])).toEqual({
        webcredentials: { apps: [iosApp] },
        applinks: {
          details: [{ appIDs: [iosApp], components: [expect.objectContaining({ "/": "/*" })] }]
        }
      });
      expect(JSON.parse(files["assetlinks.json"])).toEqual([
        { relation: ["delegate_permission/common.get_login_creds"], target: androidApp },
        { relation: ["delegate_permission/common.handle_all_urls"], target: androidApp }
      ]);
    }
  });

  // Android Credential Manager: the package and its signing certificates.
  it("lets the Android app of the variant use the passkeys of the RP domain", () => {
    const config = configOf("production");
    const files = passkeyAssociationFiles(config, {
      ...env,
      PASSKEY_ANDROID_CERT_SHA256: ` ${FINGERPRINT_A.toLowerCase()} , ${FINGERPRINT_B} `
    });

    expect(JSON.parse(files["assetlinks.json"])[0]).toEqual({
      relation: ["delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: config.android?.package,
        sha256_cert_fingerprints: [FINGERPRINT_A, FINGERPRINT_B]
      }
    });
  });

  // Every variant also opens the links printed on the v2 cards (`https://sbpc.ch/<number>`), whose
  // host serves files of its own: that claim never makes the RP ID's host open
  // all of its pages in the app. Only the claim of the RP ID's own host does.
  it("claims on the RP ID's host only the links of that host, never the v2 cards' printed ones", () => {
    const config = withoutWebAppLinks(configOf("production"));
    expect(config.ios?.associatedDomains).toContain("applinks:sbpc.ch");
    expect(config.android?.intentFilters).toContainEqual(
      expect.objectContaining({
        autoVerify: true,
        data: [expect.objectContaining({ host: "sbpc.ch" })]
      })
    );
    const files = passkeyAssociationFiles(config, env);

    expect(JSON.parse(files["apple-app-site-association"])).not.toHaveProperty("applinks");
    expect(JSON.parse(files["assetlinks.json"])).toEqual([
      expect.objectContaining({ relation: ["delegate_permission/common.get_login_creds"] })
    ]);
    // The app as configured, which claims its web app's host: that host's links.
    const claimed = passkeyAssociationFiles(configOf("production"), env);
    expect(JSON.parse(claimed["apple-app-site-association"])).toHaveProperty("applinks");
    expect(JSON.parse(claimed["assetlinks.json"])).toHaveLength(2);
  });

  // EAS CLI gives a file without extension the application/json type only when it parses as JSON.
  it("writes both files as JSON into the folder that the web export copies", () => {
    const outputDir = fs.mkdtempSync(join(tmpdir(), "well-known-"));
    try {
      const names = writePasskeyAssociationFiles(configOf("staging"), env, outputDir);

      expect(names.sort()).toEqual(["apple-app-site-association", "assetlinks.json"]);
      expect(fs.readdirSync(outputDir).sort()).toEqual(names);
      for (const name of names) {
        expect(() => JSON.parse(fs.readFileSync(join(outputDir, name), "utf8"))).not.toThrow();
      }
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  // The web app would be deployed without the files its passkeys need.
  it("refuses a deploy without RP ID or without the data of a file", () => {
    expect(() => passkeyAssociationFiles(configOf("staging", null), env)).toThrow(
      /PASSKEY_RP_ID is not set/
    );
    for (const name of ["PASSKEY_APPLE_TEAM_ID", "PASSKEY_ANDROID_CERT_SHA256"]) {
      expect(() => passkeyAssociationFiles(configOf("staging"), { ...env, [name]: " " })).toThrow(
        `${name} is not set`
      );
      expect(() =>
        passkeyAssociationFiles(configOf("staging"), { ...env, [name]: undefined })
      ).toThrow(`${name} is not set`);
    }
  });

  it("refuses values that are not a Team ID or SHA-256 fingerprints", () => {
    const config = configOf("staging");

    for (const teamId of ["abcde12345", "ABCDE1234", "ABCDE12345.ch.example"]) {
      expect(() =>
        passkeyAssociationFiles(config, { ...env, PASSKEY_APPLE_TEAM_ID: teamId })
      ).toThrow(/not an Apple Team ID/);
    }
    for (const fingerprints of [
      FINGERPRINT_A.replace(/:/g, ""),
      // SHA-1: 20 bytes.
      FINGERPRINT_A.slice(0, 59),
      `${FINGERPRINT_A},`,
      `${FINGERPRINT_A};${FINGERPRINT_B}`
    ]) {
      expect(() =>
        passkeyAssociationFiles(config, { ...env, PASSKEY_ANDROID_CERT_SHA256: fingerprints })
      ).toThrow(/not a SHA-256 certificate fingerprint/);
    }
  });

  // The certificate of android/app/debug.keystore in the React Native and Expo templates (on npm):
  // anyone signs a clone of the app with it, which would then use the passkeys of the RP ID.
  it("refuses the templates' public debug certificate, however it is written", () => {
    const debug = PUBLIC_DEBUG_FINGERPRINT;
    const config = configOf("staging");

    for (const fingerprints of [
      debug,
      debug.toLowerCase(),
      `${FINGERPRINT_A}, ${debug}`,
      ` ${debug.toLowerCase()} ,${FINGERPRINT_B}`
    ]) {
      expect(() =>
        passkeyAssociationFiles(config, { ...env, PASSKEY_ANDROID_CERT_SHA256: fingerprints })
      ).toThrow(/public debug key/);
    }
    // A fingerprint one byte away is another certificate.
    const near = `${debug.slice(0, -2)}9D`;
    expect(
      JSON.parse(
        passkeyAssociationFiles(config, { ...env, PASSKEY_ANDROID_CERT_SHA256: near })[
          "assetlinks.json"
        ]
      )[0].target.sha256_cert_fingerprints
    ).toEqual([near]);
  });
});

/**
 * A host serving `files` (name → text) under /.well-known/, as `fetch` answers: each file in
 * `application/json`, 404 otherwise. `answer` changes the answer of one file.
 */
function hostServing(
  files: Record<string, string>,
  answer: (name: string, served: Served) => Served = (_, served) => served
): { fetch: FetchServed; requests: { url: string; redirect: string }[] } {
  const requests: { url: string; redirect: string }[] = [];
  const fetch: FetchServed = async (url, init) => {
    requests.push({ url, redirect: init.redirect });
    const name = url.replace(/^https:\/\/[^/]+\/\.well-known\//, "");
    const text = files[name];
    const served: Served =
      text === undefined
        ? { status: 404, headers: { get: () => "text/html" }, text: async () => "Not found" }
        : {
            status: 200,
            headers: { get: (header) => (header === "content-type" ? "application/json" : null) },
            text: async () => text
          };
    return answer(name, served);
  };
  return { fetch, requests };
}

describe("passkey association files served", () => {
  const host = "web.example";

  // What the deploy wrote is what the host must serve: the release goes on only then.
  it("accepts the files the deploy writes, read on the RP ID's host without redirect", async () => {
    for (const variant of ["staging", "production"]) {
      const config = configOf(variant, host);
      const { fetch, requests } = hostServing(passkeyAssociationFiles(config, env));

      await expect(checkServedAssociationFiles(config, fetch)).resolves.toBe(host);
      expect(requests).toEqual([
        { url: `https://${host}/.well-known/apple-app-site-association`, redirect: "manual" },
        { url: `https://${host}/.well-known/assetlinks.json`, redirect: "manual" }
      ]);
    }
  });

  // Apple and Android follow no redirect, and want JSON served as such.
  it("refuses a file missing, redirected, served as another type or not JSON", async () => {
    const config = configOf("production", host);
    const files = passkeyAssociationFiles(config, env);
    const cases: [string, (name: string, served: Served) => Served, RegExp][] = [
      [
        "missing",
        (name, served) => (name === "assetlinks.json" ? { ...served, status: 404 } : served),
        /HTTP 404/
      ],
      ["redirected", (name, served) => ({ ...served, status: 301 }), /HTTP 301, expected 200/],
      [
        "another type",
        (name, served) => ({ ...served, headers: { get: () => "application/octet-stream" } }),
        /expected application\/json/
      ],
      ["not JSON", (name, served) => ({ ...served, text: async () => "<html>" }), /not JSON/]
    ];
    for (const [, answer, error] of cases) {
      await expect(
        checkServedAssociationFiles(config, hostServing(files, answer).fetch)
      ).rejects.toThrow(error);
    }
    // A charset after the type is still JSON.
    const charset = hostServing(files, (_, served) => ({
      ...served,
      headers: { get: () => "application/json; charset=utf-8" }
    }));
    await expect(checkServedAssociationFiles(config, charset.fetch)).resolves.toBe(host);
  });

  // Files of another variant (the staging app on production's host), or that would let no app in.
  it("refuses files that do not let the variant's apps use the passkeys", async () => {
    const production = configOf("production", host);
    const staging = passkeyAssociationFiles(configOf("staging", host), env);
    await expect(
      checkServedAssociationFiles(production, hostServing(staging).fetch)
    ).rejects.toThrow(/no <Team ID>\.ch\.swissbitcoinpay\.checkout\./);

    const files = passkeyAssociationFiles(production, env);
    const appleWithout = (change: (apple: Record<string, unknown>) => void) => {
      const apple = JSON.parse(files["apple-app-site-association"]);
      change(apple);
      return { ...files, "apple-app-site-association": JSON.stringify(apple) };
    };
    const androidWith = (change: (statements: Record<string, any>[]) => void) => {
      const statements = JSON.parse(files["assetlinks.json"]);
      change(statements);
      return { ...files, "assetlinks.json": JSON.stringify(statements) };
    };
    const cases: [Record<string, string>, RegExp][] = [
      [appleWithout((apple) => delete apple.applinks), /no applinks/],
      [
        appleWithout(
          (apple) => (apple.webcredentials = { apps: ["bad.ch.swissbitcoinpay.checkout"] })
        ),
        /no <Team ID>/
      ],
      [androidWith((statements) => statements.splice(0, 1)), /no passkeys/],
      [androidWith((statements) => statements.splice(1, 1)), /no App Links/],
      [
        androidWith((statements) => (statements[0].target.package_name = "ch.example.other")),
        /no passkeys/
      ],
      [
        androidWith((statements) => (statements[0].target.sha256_cert_fingerprints = [])),
        /no passkeys/
      ],
      [
        // The public debug key's certificate: anyone signs a clone of the app with it.
        androidWith(
          (statements) =>
            (statements[0].target.sha256_cert_fingerprints = [PUBLIC_DEBUG_FINGERPRINT])
        ),
        /no passkeys/
      ],
      [{ ...files, "assetlinks.json": "{}" }, /no passkeys/],
      [{ ...files, "assetlinks.json": "[null]" }, /no passkeys/],
      [{ ...files, "apple-app-site-association": "null" }, /no <Team ID>/]
    ];
    for (const [served, error] of cases) {
      await expect(
        checkServedAssociationFiles(production, hostServing(served).fetch)
      ).rejects.toThrow(error);
    }
  });

  it("refuses to check without RP ID", async () => {
    await expect(
      checkServedAssociationFiles(configOf("production", null), hostServing({}).fetch)
    ).rejects.toThrow(/PASSKEY_RP_ID is not set/);
  });
});
