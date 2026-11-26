/**
 * The iOS extension's own directory in the app group's container, the only one it writes (its
 * journal, its card records, its card wallets' SDK storage: EngineRuntime.swift, `ownDirectory`).
 * Removed at "Log out" (device-wipe.ts).
 *
 * IRREVERSIBLE: never rename it: installed extensions write there.
 */
export const EXTENSION_DIR_NAME = "extension";
