// scripts/wix-plugin.js: the Wix plugin's files fetched from its latest release when the app is
// bundled (metro.config.js), checked against the hashes its notes list. GitHub is a fake here.
import { WIX_PLUGIN } from "@/features/integrations/wix-plugin";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
type Fetched = {
  version: string;
  tag: string;
  files: { name: string; sha256: string }[];
  bytes: Map<string, Uint8Array>;
};
type FakeResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
type FakeFetch = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<FakeResponse>;
type WixScript = {
  WIX_PLUGIN_NAMES: string[];
  releaseHashes(notes: string): Map<string, string>;
  fetchRelease(options: { fetch: FakeFetch; tag?: string; token?: string }): Promise<Fetched>;
  writeRelease(release: Fetched, directory: string): void;
  readRelease(directory: string): { tag: string } | null;
};
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  readdirSync(dir: string): string[];
  readFileSync(file: string): Uint8Array;
  writeFileSync(file: string, content: string): void;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");
const script = jest.requireActual<WixScript>("../../scripts/wix-plugin.js");

/** The copy of a release Jest reads (jest/wix-plugin/), as its files and release.json. */
const COPY = join(__dirname, "../../jest/wix-plugin");
const copied = JSON.parse(
  new TextDecoder().decode(fs.readFileSync(join(COPY, "release.json")))
) as {
  tag: string;
  files: { name: string; sha256: string }[];
};
const bytesOf = (name: string) => Uint8Array.from(fs.readFileSync(join(COPY, `${name}.txt`)));

/** The release's notes, as the plugin's release workflow writes them: its "Files" table. */
function notes(files: { name: string; sha256: string }[] = copied.files): string {
  return [
    "First version.",
    "",
    "## Files",
    "",
    "| File | Where in the site | SHA-256 |",
    "| --- | --- | --- |",
    ...files.map(({ name, sha256 }) => `| \`${name}\` | \`backend/${name}\` | \`${sha256}\` |`),
    ""
  ].join("\r\n");
}

const DOWNLOAD = "https://github.com/sattleme/checkout-wix/releases/download";

/** GitHub, its API and its downloads: `release` overrides the release's answer. */
function github(release: Record<string, unknown> = {}, files: Map<string, Uint8Array> = new Map()) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fetch: FakeFetch = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const answer = (body: unknown, bytes: Uint8Array = new Uint8Array()): FakeResponse => ({
      ok: true,
      status: 200,
      json: async () => body,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer
    });
    if (url.startsWith("https://api.github.com/")) {
      return answer({
        tag_name: copied.tag,
        body: notes(),
        assets: copied.files.map(({ name }) => ({
          name,
          browser_download_url: `${DOWNLOAD}/${copied.tag}/${name}`
        })),
        ...release
      });
    }
    const name = url.slice(url.lastIndexOf("/") + 1);
    const bytes = files.get(name) ?? bytesOf(name);
    return answer(null, bytes);
  };
  return { fetch, calls };
}

describe("scripts/wix-plugin.js", () => {
  it("fetches the six files the guide copies, the same names, in its order", () => {
    expect(script.WIX_PLUGIN_NAMES).toEqual(WIX_PLUGIN!.files.map((file) => file.name));
  });

  it("reads each file's SHA-256 from the release's notes", () => {
    const hashes = script.releaseHashes(notes());
    expect([...hashes]).toEqual(copied.files.map(({ name, sha256 }) => [name, sha256]));
    // Not a row of that table: no hash.
    expect(script.releaseHashes("| `a.js` | `x` | `abc` |\n`b.js` 0000").size).toBe(0);
  });

  it("takes the latest release, each file checked, its token for GitHub's API only", async () => {
    const { fetch, calls } = github();
    const release = await script.fetchRelease({ fetch, token: "ghs_test" });
    expect([release.version, release.tag, release.files]).toEqual([
      copied.tag.slice(1),
      copied.tag,
      copied.files
    ]);
    for (const { name } of copied.files) {
      expect([name, release.bytes.get(name)]).toEqual([name, bytesOf(name)]);
    }
    expect(calls[0]).toEqual({
      url: "https://api.github.com/repos/sattleme/checkout-wix/releases/latest",
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer ghs_test" }
    });
    expect(calls.slice(1).map((call) => [call.url, call.headers])).toEqual(
      copied.files.map(({ name }) => [`${DOWNLOAD}/${copied.tag}/${name}`, undefined])
    );
  });

  it("takes the release WIX_PLUGIN_TAG names, without a token when there is none", async () => {
    const { fetch, calls } = github();
    await script.fetchRelease({ fetch, tag: copied.tag });
    expect(calls[0]).toEqual({
      url: `https://api.github.com/repos/sattleme/checkout-wix/releases/tags/${copied.tag}`,
      headers: { Accept: "application/vnd.github+json" }
    });
  });

  it("refuses a release it cannot check, or whose files are not the guide's", async () => {
    const changed = bytesOf("events.js");
    changed[0] = changed[0]! ^ 1;
    const cases: [ReturnType<typeof github>, string][] = [
      [github({}, new Map([["events.js", changed]])), "events.js of v1.0.0 does not match"],
      [github({ tag_name: "latest" }), "Unexpected release tag: latest"],
      [github({ body: notes(copied.files.slice(1)) }), "lists other files than the guide's"],
      [
        github({ body: notes([...copied.files, { name: "extra.js", sha256: "0".repeat(64) }]) }),
        "lists other files than the guide's"
      ],
      [github({ assets: [] }), "has no file sattleme-plugin.js"]
    ];
    for (const [{ fetch }, message] of cases) {
      await expect(script.fetchRelease({ fetch })).rejects.toThrow(message);
    }
    const down: FakeFetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    await expect(script.fetchRelease({ fetch: down })).rejects.toThrow("GitHub answered 403");
  });

  it("writes the files, then release.json, which then reads back; altered files read as none", async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), "wix-plugin-"));
    try {
      expect(script.readRelease(directory)).toBeNull();
      const release = await script.fetchRelease({ fetch: github().fetch });
      script.writeRelease(release, directory);
      expect(fs.readdirSync(directory).sort()).toEqual(
        [...copied.files.map(({ name }) => `${name}.txt`), "release.json"].sort()
      );
      expect(script.readRelease(directory)).toEqual({
        version: release.version,
        tag: release.tag,
        files: release.files
      });
      fs.writeFileSync(join(directory, "jobs.config.txt"), "{}\n");
      expect(script.readRelease(directory)).toBeNull();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("scripts/wix-plugin.js before a bundle (fetchWixPluginSync)", () => {
  // Set once the files are fetched: Metro's workers and Expo's child processes fetch nothing.
  const saved = process.env.SATTLEME_WIX_PLUGIN_FETCHED;
  afterEach(() => {
    if (saved === undefined) delete process.env.SATTLEME_WIX_PLUGIN_FETCHED;
    else process.env.SATTLEME_WIX_PLUGIN_FETCHED = saved;
  });

  type Spawned = { status: number | null };
  type BundleScript = {
    fetchWixPluginSync(): void;
    withoutWixPlugin<T>(load: () => Promise<T>): Promise<T>;
  };

  /** The script, its command's process answered by `spawnSync` (never the network). */
  function loadScript(status: number | null = 0) {
    delete process.env.SATTLEME_WIX_PLUGIN_FETCHED;
    const spawnSync = jest.fn((_file: string, _args: string[], _options: object): Spawned => ({
      status
    }));
    let loaded!: BundleScript;
    jest.isolateModules(() => {
      jest.doMock("node:child_process", () => ({ spawnSync }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("../../scripts/wix-plugin.js") as BundleScript;
    });
    return { loaded, spawnSync };
  }

  it("runs the command in a process of its own, once per process tree, its output on stderr", () => {
    const { loaded, spawnSync } = loadScript();
    loaded.fetchWixPluginSync();
    // Never on stdout: `eas build:internal` loads metro.config.js and answers its build job as JSON
    // on its stdout, which a line of the command made unreadable (no EAS build could start).
    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [join(__dirname, "../../scripts/wix-plugin.js")],
      { stdio: ["ignore", 2, 2] }
    );
    loaded.fetchWixPluginSync();
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it("throws when the command fails: no bundle without the files", () => {
    for (const status of [1, null]) {
      const { loaded } = loadScript(status);
      expect(() => loaded.fetchWixPluginSync()).toThrow(
        "The Wix plugin's files could not be fetched"
      );
      expect(process.env.SATTLEME_WIX_PLUGIN_FETCHED).toBeUndefined();
    }
  });

  it("fetches nothing while a bundle without the plugin's files loads the config, only then", async () => {
    const { loaded, spawnSync } = loadScript();
    await expect(
      loaded.withoutWixPlugin(async () => {
        loaded.fetchWixPluginSync();
        return "config";
      })
    ).resolves.toBe("config");
    await expect(
      loaded.withoutWixPlugin(async () => {
        loaded.fetchWixPluginSync();
        throw new Error("Metro could not load the config");
      })
    ).rejects.toThrow("Metro could not load the config");
    expect(spawnSync).not.toHaveBeenCalled();
    // Nothing of it is left to the process's environment.
    expect(process.env.SATTLEME_WIX_PLUGIN_FETCHED).toBeUndefined();
    // The next bundle fetches the files, after a load that failed too.
    loaded.fetchWixPluginSync();
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});
