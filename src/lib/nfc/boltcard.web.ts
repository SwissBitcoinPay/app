import { lnurlFromRecords, type RawRecord } from "./ndef";

/**
 * Same API as boltcard.ts, with Web NFC: Chrome on Android only. Its scan needs the page's
 * permission, asked at the first scan, which must follow a tap: reading is always `tap` here.
 */
export type CardReading = "auto" | "tap" | "none";

type NdefRecordLike = { recordType: string; data?: DataView; encoding?: string };
type NdefReaderLike = {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: { message: { records: NdefRecordLike[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};

function readerClass(): (new () => NdefReaderLike) | null {
  const candidate = (globalThis as { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
  return typeof candidate === "function" ? candidate : null;
}

export async function getCardReading(): Promise<CardReading> {
  return readerClass() ? "tap" : "none";
}

export type CardRead = { lnurl: Promise<string>; cancel: () => void };

/** Thrown when a reading is cancelled by `CardRead.cancel`. */
class CardReadCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CardReadCancelled";
  }
}

/** Same as boltcard.ts: a reading cancelled by `cancel`. */
export function isReadCancelled(error: unknown): boolean {
  return error instanceof CardReadCancelled;
}

function bytesOf(data: DataView | undefined): number[] {
  if (!data) return [];
  return Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

/** Web NFC hands records already decoded by type: rebuilt as raw records for lnurlFromRecords. */
function toRawRecord(record: NdefRecordLike): RawRecord | null {
  const bytes = bytesOf(record.data);
  if (record.recordType === "url" || record.recordType === "absolute-url") {
    // Web NFC strips the URI prefix code: 0 means "no prefix".
    return { tnf: 1, type: "U", payload: [0, ...bytes] };
  }
  if (record.recordType === "text") {
    // Text already without its status byte and language: rebuilt with an empty language.
    return { tnf: 1, type: "T", payload: [0, ...bytes] };
  }
  return null;
}

export function readCard(_options: { alertMessage: string }): CardRead {
  const Reader = readerClass();
  const controller = new AbortController();
  const lnurl = new Promise<string>((resolve, reject) => {
    if (!Reader) {
      reject(new Error("Web NFC is not available"));
      return;
    }
    const reader = new Reader();
    controller.signal.addEventListener("abort", () => reject(new CardReadCancelled()));
    reader.onreading = (event) => {
      const records = event.message.records
        .map(toRawRecord)
        .filter((r): r is RawRecord => r !== null);
      const found = lnurlFromRecords(records);
      // Settled before the abort: its listener rejects with "Cancelled", which must not win.
      if (found) resolve(found);
      else reject(new Error("Not a BoltCard"));
      controller.abort();
    };
    reader.onreadingerror = () => {
      reject(new Error("Unreadable card"));
      controller.abort();
    };
    reader.scan({ signal: controller.signal }).catch((error: unknown) => {
      // Settled before the abort, as above: a refused permission or NFC turned off is a failure,
      // not a cancelled reading.
      reject(error instanceof Error ? error : new Error(String(error)));
      controller.abort();
    });
  });
  return { lnurl, cancel: () => controller.abort() };
}
