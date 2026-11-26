/**
 * The Wix plugin's files that the app's Wix guide copies (src/features/integrations/wix-plugin.ts),
 * fetched from the latest release of sattleme/checkout-wix (or the release WIX_PLUGIN_TAG names,
 * `v1.2.3`) into assets/plugins/wix/, which git ignores: each file as `<name>.txt` (Metro's text
 * assets), then release.json, the release's version and each file's SHA-256 as its notes list them.
 * Every download is checked against its listed hash before anything is written. metro.config.js
 * runs it before each bundle (dev server, web export, native builds, updates), once per process
 * tree, except for the iOS extension's engine, which holds none of them (withoutWixPlugin).
 * Offline, files fetched earlier stay, with a warning; without any, the bundle fails.
 *
 * GitHub's API answers 60 requests an hour per address without a token: GITHUB_TOKEN or GH_TOKEN,
 * when set, goes to api.github.com only, never to the downloads.
 */
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY = "sattleme/checkout-wix";

/** The files the guide has made in Wix, in its order: a release must have exactly these. */
const WIX_PLUGIN_NAMES = [
  "sattleme-plugin.js",
  "http-functions.js",
  "events.js",
  "jobs.config",
  "sattlemeCheckout.js",
  "sattlemeCheckout-config.js"
];

const DIRECTORY = path.join(__dirname, "..", "assets", "plugins", "wix");

/** Set once the files are fetched: Metro's workers and Expo's child processes fetch nothing. */
const FETCHED = "SATTLEME_WIX_PLUGIN_FETCHED";

/**
 * Each file's SHA-256 from a release's notes, whose "Files" table the plugin's release workflow
 * writes: | `name` | `place in the site` | `sha256` |.
 */
function releaseHashes(notes) {
  const hashes = new Map();
  for (const line of String(notes).split(/\r?\n/)) {
    const row = /^\|\s*`([^`]+)`\s*\|\s*`[^`]+`\s*\|\s*`([0-9a-f]{64})`\s*\|\s*$/.exec(line.trim());
    if (row) hashes.set(row[1], row[2]);
  }
  return hashes;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Fetches the release's files and checks them: `{ version, tag, files: [{ name, sha256 }] }`,
 * the files' bytes in `bytes`, nothing written. Throws on anything unexpected.
 */
async function fetchRelease({ fetch: get = fetch, tag, token } = {}) {
  const api = `https://api.github.com/repos/${REPOSITORY}/releases/${
    tag ? `tags/${encodeURIComponent(tag)}` : "latest"
  }`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answer = await get(api, { headers });
  if (!answer.ok) throw new Error(`GitHub answered ${answer.status} for ${api}`);
  const release = await answer.json();
  const version = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "")?.[1];
  if (!version) throw new Error(`Unexpected release tag: ${release.tag_name}`);
  const hashes = releaseHashes(release.body);
  const assets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  const listed = [...hashes.keys()].sort().join(", ");
  if (listed !== [...WIX_PLUGIN_NAMES].sort().join(", ")) {
    throw new Error(
      `The release ${release.tag_name} lists other files than the guide's: ${listed}`
    );
  }
  const bytes = new Map();
  for (const name of WIX_PLUGIN_NAMES) {
    const asset = assets.get(name);
    if (!asset) throw new Error(`The release ${release.tag_name} has no file ${name}`);
    const download = await get(asset.browser_download_url);
    if (!download.ok) throw new Error(`GitHub answered ${download.status} for ${name}`);
    const content = new Uint8Array(await download.arrayBuffer());
    if (sha256(content) !== hashes.get(name)) {
      throw new Error(`${name} of ${release.tag_name} does not match its SHA-256`);
    }
    bytes.set(name, content);
  }
  return {
    version,
    tag: release.tag_name,
    files: WIX_PLUGIN_NAMES.map((name) => ({ name, sha256: hashes.get(name) })),
    bytes
  };
}

/**
 * Writes a fetched release into `directory`: each file next to its new name, then renamed, then
 * release.json last, so that a release.json always describes the files beside it.
 */
function writeRelease({ version, tag, files, bytes }, directory = DIRECTORY) {
  fs.mkdirSync(directory, { recursive: true });
  for (const { name } of files) {
    const file = path.join(directory, `${name}.txt`);
    fs.writeFileSync(`${file}.part`, bytes.get(name));
    fs.renameSync(`${file}.part`, file);
  }
  const manifest = path.join(directory, "release.json");
  fs.writeFileSync(`${manifest}.part`, `${JSON.stringify({ version, tag, files }, null, 2)}\n`);
  fs.renameSync(`${manifest}.part`, manifest);
}

/** The release.json of files fetched earlier whose bytes still match it, else null. */
function readRelease(directory = DIRECTORY) {
  try {
    const release = JSON.parse(fs.readFileSync(path.join(directory, "release.json"), "utf8"));
    const names = (release.files ?? []).map((file) => file.name);
    if (names.join("\n") !== WIX_PLUGIN_NAMES.join("\n")) return null;
    for (const file of release.files) {
      const bytes = fs.readFileSync(path.join(directory, `${file.name}.txt`));
      if (sha256(bytes) !== file.sha256) return null;
    }
    return release;
  } catch {
    return null;
  }
}

/** The command: fetches and writes the release, or keeps the files fetched earlier when offline. */
async function main() {
  const tag = process.env.WIX_PLUGIN_TAG || undefined;
  try {
    const release = await fetchRelease({
      tag,
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined
    });
    writeRelease(release);
    console.log(`Wix plugin ${release.tag}: ${release.files.length} files fetched and checked.`);
  } catch (error) {
    const earlier = readRelease();
    if (earlier && (!tag || earlier.tag === tag)) {
      console.warn(`Wix plugin: ${error.message}. Keeping ${earlier.tag}, fetched earlier.`);
      return;
    }
    console.error(`Wix plugin: ${error.message}.`);
    process.exitCode = 1;
  }
}

/**
 * How many loads of metro.config.js for a bundle that holds none of the plugin's files are under
 * way in this process (withoutWixPlugin). A count in memory, not a variable of the environment:
 * nothing outside the process can keep an app's bundle from fetching the files.
 */
let loadsWithoutPlugin = 0;

/**
 * Runs `load` (a load of metro.config.js, through Metro.loadConfig) with nothing fetched: for a
 * bundle that holds none of the plugin's files, the iOS extension's engine
 * (scripts/extension-engine.js), whose walk refuses the `require` of src/features/integrations/
 * wix-plugin.ts. Only for the time of `load`: a bundle loaded after it fetches the files again.
 */
async function withoutWixPlugin(load) {
  loadsWithoutPlugin += 1;
  try {
    return await load();
  } finally {
    loadsWithoutPlugin -= 1;
  }
}

/**
 * Runs the command in a process of its own, synchronously, once per process tree (metro.config.js
 * is synchronous), except within withoutWixPlugin. Throws when it fails.
 *
 * What the command writes goes to standard error, never to standard output: a process that loads
 * metro.config.js may answer on its standard output, which a line written there would corrupt. EAS
 * Build's `eas build:internal` loads it (eas-cli, validateMetroConfigForManagedWorkflowAsync) and
 * answers its build job as JSON there (@expo/build-tools, easBuildInternal.js: `JSON.parse`).
 */
const STDIO = ["ignore", 2, 2];

function fetchWixPluginSync() {
  if (loadsWithoutPlugin > 0 || process.env[FETCHED]) return;
  const run = spawnSync(process.execPath, [__filename], { stdio: STDIO });
  if (run.status !== 0) {
    throw new Error("The Wix plugin's files could not be fetched (scripts/wix-plugin.js)");
  }
  process.env[FETCHED] = "1";
}

if (require.main === module) main();

module.exports = {
  WIX_PLUGIN_NAMES,
  fetchRelease,
  fetchWixPluginSync,
  readRelease,
  releaseHashes,
  withoutWixPlugin,
  writeRelease
};
