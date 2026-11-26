import type { Language } from "@/i18n/languages";
import { swissSpelling } from "@/i18n/swiss-spelling";
import type { AppInfo } from "@/lib/app-info";

import { NOTES } from "./notes.generated";

/*
 * "What's new": each version's notes, for users, in every language, shown from the version's
 * label (VersionLabel.tsx). Written in release-notes/ (one folder per version, one Markdown file
 * per language, French first, in the Markdown of src/lib/release-notes/markdown.ts), bundled as
 * notes.generated.ts by `npm run release-notes`. The notes of the version being made are in
 * release-notes/next/, shown in the staging app only ("Next version"). At the version's release,
 * that folder takes the version's name and the version joins RELEASES, with its date; a test fails
 * for a version of package.json from NOTES_FROM on without its notes.
 */

/** The first version released with notes: it and every later one have them. */
export const NOTES_FROM = "3.0.0";

/** The key of the notes of the version being made. */
export const NEXT = "next";

/** A released version with notes: its number and its release date (YYYY-MM-DD, UTC). */
export type Release = { version: string; date: string };

/** The versions released with notes, the latest first. Each has its notes in every language. */
export const RELEASES: readonly Release[] = [{ version: "3.0.0", date: "2026-11-26" }];

/** One version's notes as the app shows them: `version` null for the version being made. */
export type ShownRelease = { key: string; version: string | null; date: string | null };

/** A version's numbers ("2.10.0" -> [2, 10, 0]); null when it is not one ("unknown"). */
export function versionNumbers(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Negative when `a` comes before `b`, 0 when equal, positive after; null if either is no version. */
export function compareVersions(a: string, b: string): number | null {
  const x = versionNumbers(a);
  const y = versionNumbers(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return 0;
}

/**
 * The notes of `language`, at their versions' keys. Swiss Standard German's are German's in Swiss
 * spelling (no ß, guillemets: src/i18n/swiss-spelling.ts).
 */
export function notesOf(language: Language): Readonly<Record<string, string | undefined>> {
  const notes: Record<string, string> = {};
  for (const [key, languages] of Object.entries(NOTES)) {
    notes[key] = language === "de-CH" ? swissSpelling(languages.de) : languages[language];
  }
  return notes;
}

/**
 * The versions whose notes the app shows, the latest first: in the staging app, the version being
 * made, if it has notes; then the released versions up to the app's own (a newer one's notes are
 * never shown by an older app). An app whose version is no number ("unknown") shows them all.
 */
export function shownReleases(
  info: Pick<AppInfo, "variant" | "version">,
  releases: readonly Release[] = RELEASES,
  hasNext: boolean = NOTES[NEXT] !== undefined
): ShownRelease[] {
  const shown: ShownRelease[] = [];
  if (info.variant === "staging" && hasNext) shown.push({ key: NEXT, version: null, date: null });
  for (const release of releases) {
    const order = compareVersions(release.version, info.version);
    if (order === null || order <= 0) {
      shown.push({ key: release.version, version: release.version, date: release.date });
    }
  }
  return shown;
}
