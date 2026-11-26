import { Directory, File, Paths } from "expo-file-system";

/**
 * Where the followed sales are kept (followed-sales.ts): one JSON file in the documents directory,
 * like the relays' changes (src/lib/registry/moves-store.ts): no size limit (the secure storage may
 * refuse values of about 2 KB on some iOS releases, expo-secure-store v57; a sale names up to 20
 * transactions and 10 relays), nothing secret. Same API on the web: followed-sales-store.web.ts.
 * Never rename the directory nor the file: installed apps keep their sales there (device-wipe.ts
 * removes the directory).
 */
export const FOLLOWED_SALES_DIR_NAME = "followed-sales";
const FILE_NAME = "sales.json";

/** The stored record, null when none. Rejects when it cannot be read. */
export async function readFollowedSales(): Promise<string | null> {
  const file = new File(new Directory(Paths.document, FOLLOWED_SALES_DIR_NAME), FILE_NAME);
  return file.exists ? await file.text() : null;
}

/** Stores the record (`null`: removed). */
export async function writeFollowedSales(record: string | null): Promise<void> {
  const directory = new Directory(Paths.document, FOLLOWED_SALES_DIR_NAME);
  const file = new File(directory, FILE_NAME);
  if (record === null) {
    if (file.exists) file.delete();
    return;
  }
  directory.create({ intermediates: true, idempotent: true });
  // Written next to the target, then moved over it: never a truncated file.
  const draft = new File(directory, `${FILE_NAME}.tmp`);
  draft.writeSync(record);
  draft.moveSync(file, { overwrite: true });
}
