# Release notes

What the app shows in **What's new**, opened from the version number (next to the logo on a
computer, at the bottom of Settings on a phone). One folder per version, one Markdown file per
language: `fr.md` (the source), `en.md`, `de.md`, `it.md`, `es.md`, `pt.md`, `fi.md`. Swiss German
is German in Swiss spelling, written by the app.

- `next/`: the version being made. Shown in the staging app only, as "Next version".
- `3.0.0/`, …: the released versions, shown from the version that released them on.

## Writing

For users, in their words: what they can do, see or no longer suffer from. Never a pull request's
title, a file or a technical term. The app's own labels, as the app writes them.

Only this Markdown, which the app reads (`src/lib/release-notes/markdown.ts`); anything else fails
the tests:

```md
### New

- One change, on one line, **bold** where it matters.

### Improved

### Fixed
```

Then run `npm run release-notes`: it writes the notes into the app
(`src/features/release-notes/notes.generated.ts`). A test fails until it is run.

## Releasing a version

1. Rename `next/` after the version (`3.0.0/`).
2. Add the version and its date to `RELEASES` (`src/features/release-notes/releases.ts`).
3. Run `npm run release-notes`.

From 3.0.0 on, a test fails for a version of `package.json` released without its notes.
