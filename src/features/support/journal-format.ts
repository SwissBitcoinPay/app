/*
 * The journal deposited for support: the format both sides share, the app that writes it (deposit.ts) and support's reader
 * (scripts/support-journal.mjs), which imports this very file with Node (its types stripped), from
 * a checkout without its packages installed (the reader may run where Node is another version
 * than the project's, which the project's npm refuses). So it imports nothing.
 *
 * Released formats: never change a value here (AGENTS.md, "Irreversible"); a new format gets a new
 * version, which the reader learns before the app writes it.
 */

/** The records' type (`t` of sealRecord). */
export const JOURNAL_RECORD_TYPE = "support-journal";

/** The version of a part's value; the reader refuses another. */
export const JOURNAL_VERSION = 1;

/**
 * Compressed bytes per record, at most: as an image's record (src/lib/media/image.ts,
 * MAX_IMAGE_BYTES), its event stays near 55 KB, under the 64 KB strfry takes by default.
 */
export const JOURNAL_PART_BYTES = 30_000;

/**
 * Records of one journal, at most: 240 KB compressed. A full journal (2000 entries) compresses to
 * 30 to 48 KB with the code's own texts: one or two records.
 */
export const JOURNAL_MAX_PARTS = 8;

/** The journal's text, at most, before it is compressed and after it is inflated (bytes). */
export const JOURNAL_MAX_REPORT_BYTES = 4_000_000;

/** How long the relays keep it (NIP-40): 30 days. */
export const JOURNAL_LIFETIME_S = 30 * 24 * 60 * 60;

/** Its plaintexts are padded to multiples of this: the size tells little of the journal. */
export const JOURNAL_BLOCK = 4096;
