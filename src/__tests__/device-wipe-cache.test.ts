import { Directory, File, Paths } from "expo-file-system";

import { sharePdf, writePdf } from "@/features/invoices/pdf";
import { INVOICE_MARGINS } from "@/features/invoices/invoice-html";
import { clearAppCache, NATIVE_OUTPUT_DIRECTORIES } from "@/features/settings/cache-wipe";
import { wipeDevice } from "@/features/settings/device-wipe";
import { shareCsv } from "@/features/wallet/export/share";
import { logFailure } from "@/lib/log/log";

import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * "Log out" and the app's cache: the CSV of "Export" and the invoices' PDFs, which name the
 * business's clients, are gone; the directories of the system and of other libraries stay.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const CSV = "Date;Amount\n2026-11-02;12.50 CHF\n";
const CLIENT = "Bastion Coffee LLC, 12 Station Road, 1204 Geneva";

function cacheEntries(): string[] {
  return [...fileSystem.files.keys(), ...fileSystem.binaries.keys()]
    .filter((uri) => uri.startsWith(Paths.cache.uri))
    .map((uri) => uri.slice(Paths.cache.uri.length))
    .sort();
}

function write(path: string, text = "x"): void {
  const file = new File(Paths.cache, path);
  new Directory(file.uri.slice(0, file.uri.lastIndexOf("/"))).create({
    intermediates: true,
    idempotent: true
  });
  file.writeSync(text);
}

beforeEach(() => fileSystem.resetFileSystem());
afterEach(() => jest.restoreAllMocks());

describe('"Log out" and the app\'s cache', () => {
  it("removes the exports and the invoices' PDFs", async () => {
    await shareCsv(CSV, "Bakery-2026-10.csv", "Export");
    await sharePdf(`<p>${CLIENT}</p>`, "Invoice", "Invoice-2026-0042.pdf", INVOICE_MARGINS);
    expect(cacheEntries()).toEqual(["Bakery-2026-10.csv", "Invoice-2026-0042.pdf"]);

    await wipeDevice();

    expect(cacheEntries()).toEqual([]);
    expect(new Directory(Paths.cache).exists).toBe(true);
  });

  it("removes a PDF left under expo-print's own name", async () => {
    jest.spyOn(File.prototype, "moveSync").mockImplementationOnce(() => {
      throw new Error("No space left on device");
    });
    const uri = await writePdf(`<p>${CLIENT}</p>`, "Invoice-2026-0042.pdf", INVOICE_MARGINS);
    expect(uri).toContain("/cache/Print/");

    await wipeDevice();

    expect(cacheEntries()).toEqual([]);
    expect(new Directory(Paths.cache, "Print").exists).toBe(false);
  });

  it("removes what the native modules made for the app, and the files of older versions", () => {
    for (const name of NATIVE_OUTPUT_DIRECTORIES) write(`${name}/0d3c.jpg`);
    write("Invoice-2026-0001.pdf");
    write("3f9a7c1e-5b2d-4e8f-9a6b-1c2d3e4f5a6b");

    clearAppCache();

    expect(cacheEntries()).toEqual([]);
    for (const name of NATIVE_OUTPUT_DIRECTORIES) {
      expect(new Directory(Paths.cache, name).exists).toBe(false);
    }
  });

  it("leaves the directories of the system and of other libraries", () => {
    write("ch.swissbitcoinpay.checkout/Cache.db");
    write("WebView/Default/HTTP Cache/index");
    write("Export.csv");

    clearAppCache();

    expect(cacheEntries()).toEqual([
      "WebView/Default/HTTP Cache/index",
      "ch.swissbitcoinpay.checkout/Cache.db"
    ]);
  });

  it("removes the app's journal with it", async () => {
    logFailure("Syncing the team's channels failed", new TypeError("Network request failed"));
    write("Export.csv");
    expect(cacheEntries()).toContain("app-log/journal.jsonl");

    await wipeDevice();

    expect(cacheEntries()).toEqual([]);
  });

  it("tries every file, then fails the wipe when one stays", async () => {
    write("Export-1.csv");
    write("Export-2.csv");
    const remove = jest.spyOn(File.prototype, "delete");
    remove.mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });

    expect(() => clearAppCache()).toThrow(
      "The cache could not be cleared: Error: Permission denied"
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(cacheEntries()).toHaveLength(1);

    write("Export-3.csv");
    remove.mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });
    await expect(wipeDevice()).rejects.toThrow("The device could not be wiped");
  });

  it("does nothing without a cache directory", () => {
    new Directory(Paths.cache).delete();
    expect(() => clearAppCache()).not.toThrow();
  });
});
