import "@/i18n";

import packageJson from "../../package.json";

import {
  compareVersions,
  NEXT,
  notesOf,
  NOTES_FROM,
  RELEASES,
  shownReleases,
  versionNumbers
} from "@/features/release-notes/releases";
import { parseStoredSeen, serializeSeen } from "@/features/release-notes/seen-format";
import { LANGUAGES } from "@/i18n/languages";
import { parseMarkdown, parseSpans, unsupportedMarkdown } from "@/lib/release-notes/markdown";

describe("the release notes' Markdown", () => {
  it("reads titles, lists and paragraphs, parted by blank lines or another block", () => {
    const blocks = parseMarkdown(
      "### New\n- One\n- Two **bold**\n\nA paragraph\non two lines.\n## Fixed\n- Three"
    );
    expect(blocks).toEqual([
      { kind: "heading", spans: [{ text: "New", bold: false }] },
      {
        kind: "list",
        items: [
          [{ text: "One", bold: false }],
          [
            { text: "Two ", bold: false },
            { text: "bold", bold: true }
          ]
        ]
      },
      { kind: "paragraph", spans: [{ text: "A paragraph on two lines.", bold: false }] },
      { kind: "heading", spans: [{ text: "Fixed", bold: false }] },
      { kind: "list", items: [[{ text: "Three", bold: false }]] }
    ]);
  });

  it("reads Windows line ends and indented lines alike", () => {
    expect(parseMarkdown("  ### New\r\n  - One\r\n")).toEqual(parseMarkdown("### New\n- One\n"));
  });

  it("leaves an unclosed bold as written", () => {
    expect(parseSpans("a **b")).toEqual([{ text: "a **b", bold: false }]);
    expect(parseSpans("**a** b **c**")).toEqual([
      { text: "a", bold: true },
      { text: " b ", bold: false },
      { text: "c", bold: true }
    ]);
  });

  it("names what it does not read: shown as written, so never in a note", () => {
    expect(unsupportedMarkdown("### New\n- One **bold**\n\nText, “quoted” : fine.")).toEqual([]);
    for (const line of [
      "# Title",
      "#### Title",
      "* item",
      "+ item",
      "1. item",
      "> quote",
      "| a | b |",
      "```",
      "---",
      "A [link](https://example.com)",
      "Some `code`",
      "Some _italic_",
      "Some *italic*",
      "An **unclosed bold",
      "<b>html</b>"
    ]) {
      expect(unsupportedMarkdown(line)).toEqual([line]);
    }
  });
});

describe("the release notes", () => {
  const keys = (language: (typeof LANGUAGES)[number]) => Object.keys(notesOf(language)).sort();

  it("are the same versions in every language", () => {
    for (const language of LANGUAGES) expect(keys(language)).toEqual(keys("fr"));
  });

  it("are written in every language, within the Markdown the app reads", () => {
    for (const language of LANGUAGES) {
      for (const [key, markdown] of Object.entries(notesOf(language))) {
        expect({ language, key, empty: (markdown ?? "").trim() === "" }).toEqual({
          language,
          key,
          empty: false
        });
        expect({ language, key, faults: unsupportedMarkdown(markdown ?? "") }).toEqual({
          language,
          key,
          faults: []
        });
      }
    }
  });

  it("are the released versions' and the next one's, nothing else", () => {
    const released = RELEASES.map((release) => release.version);
    expect(keys("fr").filter((key) => key !== NEXT)).toEqual([...released].sort());
  });

  it("list the released versions from NOTES_FROM on, the latest first, with their dates", () => {
    let previous: string | null = null;
    for (const { version, date } of RELEASES) {
      expect(versionNumbers(version)).not.toBeNull();
      expect(compareVersions(version, NOTES_FROM)).toBeGreaterThanOrEqual(0);
      if (previous !== null) expect(compareVersions(version, previous)).toBeLessThan(0);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
      previous = version;
    }
  });

  // Written with each version: a version from NOTES_FROM on is released with its notes.
  it("have the notes of package.json's version, from NOTES_FROM on", () => {
    const order = compareVersions(packageJson.version, NOTES_FROM);
    expect(order).not.toBeNull();
    if (order! >= 0) {
      expect(RELEASES.map((release) => release.version)).toContain(packageJson.version);
    }
  });
});

// Node's modules, typed here: the app's TypeScript has no Node types.
const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, text: string): void;
  mkdirSync(path: string, options: { recursive: true }): void;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

// scripts/release-notes.js: the Markdown files of release-notes/, written into the app's module.
const script = jest.requireActual<{
  MODULE_FILE: string;
  NOTE_LANGUAGES: string[];
  readReleaseNotes(dir?: string): Record<string, Record<string, string>>;
  releaseNotesModule(notes: Record<string, Record<string, string>>): string;
}>("../../scripts/release-notes.js");

describe("the release notes' files", () => {
  it("are in the app as written: run `npm run release-notes` after changing them", () => {
    expect(fs.readFileSync(script.MODULE_FILE, "utf8")).toBe(
      script.releaseNotesModule(script.readReleaseNotes())
    );
  });

  it("are one per language of the app, Swiss German written from German", () => {
    expect([...script.NOTE_LANGUAGES, "de-CH"].sort()).toEqual([...LANGUAGES].sort());
    const german = notesOf("de");
    const swiss = notesOf("de-CH");
    expect(Object.keys(german).length).toBeGreaterThan(0);
    for (const [key, text] of Object.entries(german)) {
      expect(swiss[key]).not.toMatch(/[ß„“]/);
      expect(swiss[key]).toBe(text!.replace(/ß/g, "ss").replace(/„/g, "«").replace(/“/g, "»"));
    }
  });

  describe("are refused", () => {
    let dir: string;
    const write = (path: string, text = "### New\n\n- A change.\n") => {
      fs.mkdirSync(join(dir, path, ".."), { recursive: true });
      fs.writeFileSync(join(dir, path), text);
    };
    const complete = (folder: string) => {
      for (const language of script.NOTE_LANGUAGES) write(`${folder}/${language}.md`);
    };

    beforeEach(() => {
      dir = fs.mkdtempSync(join(tmpdir(), "release-notes-"));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("for a missing or empty language", () => {
      complete("next");
      fs.rmSync(join(dir, "next", "fi.md"));
      expect(() => script.readReleaseNotes(dir)).toThrow("release-notes/next: missing fi.md");
      write("next/fi.md", "  \n");
      expect(() => script.readReleaseNotes(dir)).toThrow("release-notes/next/fi.md: empty");
    });

    it("for a file of no language, or a folder of no version", () => {
      complete("next");
      write("next/notes.txt");
      expect(() => script.readReleaseNotes(dir)).toThrow("unexpected notes.txt");
      fs.rmSync(join(dir, "next", "notes.txt"));
      complete("v2.10");
      expect(() => script.readReleaseNotes(dir)).toThrow("release-notes/v2.10: a folder is");
    });

    it("but for the folder's guide", () => {
      complete("next");
      complete("2.10.0");
      write("README.md", "# Release notes\n");
      expect(Object.keys(script.readReleaseNotes(dir))).toEqual(
        expect.arrayContaining(["next", "2.10.0"])
      );
    });
  });

  it("are written in a stable order, the next version first, then the latest", () => {
    const notes = { "2.9.1": { fr: "a" }, next: { fr: "b" }, "2.10.0": { fr: "c" } };
    const module = script.releaseNotesModule(notes);
    const order = ["next", "2.10.0", "2.9.1"].map((key) => module.indexOf(`"${key}":`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("the release notes shown", () => {
  const releases = [
    { version: "3.1.0", date: "2027-02-01" },
    { version: "3.0.0", date: "2026-12-02" }
  ];

  it("lead with the next version's in the staging app only", () => {
    expect(shownReleases({ variant: "staging", version: "3.0.0" }, releases, true)).toEqual([
      { key: NEXT, version: null, date: null },
      { key: "3.0.0", version: "3.0.0", date: "2026-12-02" }
    ]);
    expect(shownReleases({ variant: "staging", version: "3.1.0" }, releases, false)).toEqual([
      { key: "3.1.0", version: "3.1.0", date: "2027-02-01" },
      { key: "3.0.0", version: "3.0.0", date: "2026-12-02" }
    ]);
    expect(shownReleases({ variant: "production", version: "3.1.0" }, releases, true)).toEqual([
      { key: "3.1.0", version: "3.1.0", date: "2027-02-01" },
      { key: "3.0.0", version: "3.0.0", date: "2026-12-02" }
    ]);
  });

  it("never include a version newer than the app", () => {
    expect(shownReleases({ variant: "production", version: "3.0.0" }, releases, true)).toEqual([
      { key: "3.0.0", version: "3.0.0", date: "2026-12-02" }
    ]);
    expect(shownReleases({ variant: "production", version: "2.9.0" }, releases, true)).toEqual([]);
  });

  it("include every version for an app whose version is no number", () => {
    expect(shownReleases({ variant: "production", version: "unknown" }, releases, false)).toEqual([
      { key: "3.1.0", version: "3.1.0", date: "2027-02-01" },
      { key: "3.0.0", version: "3.0.0", date: "2026-12-02" }
    ]);
  });

  it("compare versions by their numbers", () => {
    expect(compareVersions("2.10.0", "2.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.9.0", "2.9.0")).toBe(0);
    expect(compareVersions("2.9.1", "2.10.0")).toBeLessThan(0);
    expect(compareVersions("unknown", "2.9.0")).toBeNull();
  });
});

describe("the release notes last opened, as stored", () => {
  it("are read back as written", () => {
    expect(parseStoredSeen(serializeSeen("2.10.0"))).toBe("2.10.0");
    expect(parseStoredSeen(serializeSeen(NEXT))).toBe(NEXT);
  });

  it("are none when absent, damaged or of another format", () => {
    for (const stored of [
      null,
      "",
      "{",
      "null",
      JSON.stringify({ version: 2, seen: "2.10.0" }),
      JSON.stringify({ version: 1, seen: 5 }),
      JSON.stringify({ version: 1, seen: "" }),
      JSON.stringify({ version: 1, seen: "x".repeat(33) })
    ]) {
      expect(parseStoredSeen(stored)).toBeNull();
    }
  });
});
