// "What's new": the release notes of release-notes/ (one folder per version, one Markdown file per
// language), written into src/features/release-notes/notes.generated.ts, which the app bundles.
// The Markdown files are the source: edit them, then run `npm run release-notes`. A test fails while
// the module and the files differ (src/__tests__/release-notes.test.ts), and when a language, a
// folder or a file is not one of the expected ones.
//
// Swiss Standard German has no file: the app writes German's in Swiss spelling
// (src/features/release-notes/releases.ts).
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.join(__dirname, "..");

/** Where the notes are written, one folder per version. */
const NOTES_DIR = path.join(PROJECT_ROOT, "release-notes");

/** The module the app imports. */
const MODULE_FILE = path.join(
  PROJECT_ROOT,
  "src",
  "features",
  "release-notes",
  "notes.generated.ts"
);

/** One file per language, as src/i18n/languages.ts names them, Swiss German apart. */
const NOTE_LANGUAGES = ["fr", "en", "de", "it", "es", "pt", "fi"];

/** The folder of the version being made. */
const NEXT = "next";

/** A released version's folder: its number. */
const VERSION = /^\d+\.\d+\.\d+$/;

/** Files of the folder that are not notes (its guide). */
const IGNORED_FILES = new Set(["README.md"]);

/**
 * The notes of `dir`, at their folders' names, then their languages. Throws for a folder that is
 * neither `next` nor a version, a language file missing or empty, or any other file.
 */
function readReleaseNotes(dir = NOTES_DIR) {
  const notes = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && IGNORED_FILES.has(entry.name)) continue;
    if (!entry.isDirectory())
      throw new Error(`release-notes/${entry.name}: not a version's folder`);
    const key = entry.name;
    if (key !== NEXT && !VERSION.test(key)) {
      throw new Error(`release-notes/${key}: a folder is "${NEXT}" or a version (1.2.3)`);
    }
    const files = fs.readdirSync(path.join(dir, key)).sort();
    const expected = NOTE_LANGUAGES.map((language) => `${language}.md`).sort();
    const missing = expected.filter((file) => !files.includes(file));
    const extra = files.filter((file) => !expected.includes(file));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `release-notes/${key}: ` +
          [
            missing.length > 0 ? `missing ${missing.join(", ")}` : null,
            extra.length > 0 ? `unexpected ${extra.join(", ")}` : null
          ]
            .filter(Boolean)
            .join("; ")
      );
    }
    notes[key] = {};
    for (const language of NOTE_LANGUAGES) {
      const text = fs.readFileSync(path.join(dir, key, `${language}.md`), "utf8").trim();
      if (text.length === 0) throw new Error(`release-notes/${key}/${language}.md: empty`);
      notes[key][language] = text;
    }
  }
  return notes;
}

/** The TypeScript module of `notes`, its keys in a stable order (`next`, then the latest first). */
function releaseNotesModule(notes) {
  const order = (key) => (key === NEXT ? [Infinity] : key.split(".").map(Number));
  const keys = Object.keys(notes).sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    }
    return 0;
  });
  const sorted = {};
  for (const key of keys) {
    sorted[key] = {};
    for (const language of NOTE_LANGUAGES) sorted[key][language] = notes[key][language];
  }
  const type = NOTE_LANGUAGES.map((language) => `"${language}"`).join(" | ");
  return (
    "// Written by `npm run release-notes` (scripts/release-notes.js) from release-notes/: never by\n" +
    "// hand. Edit the Markdown files there, then run it again.\n" +
    `export type NoteLanguage = ${type};\n\n` +
    "export const NOTES: Readonly<Record<string, Readonly<Record<NoteLanguage, string>>>> = " +
    `${JSON.stringify(sorted, null, 2)};\n`
  );
}

module.exports = {
  MODULE_FILE,
  NEXT,
  NOTES_DIR,
  NOTE_LANGUAGES,
  readReleaseNotes,
  releaseNotesModule
};

if (require.main === module) {
  try {
    fs.writeFileSync(MODULE_FILE, releaseNotesModule(readReleaseNotes()));
    console.log(`Wrote ${path.relative(PROJECT_ROOT, MODULE_FILE)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
