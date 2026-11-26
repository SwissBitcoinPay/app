/**
 * NDEF records as BoltCards write them: one URI record (`lnurlw://…`), sometimes a text record.
 * Decoded by hand (NFC Forum RTD URI 1.0 and RTD Text 1.0), the same on native and web.
 */

/** RTD URI abbreviations (identifier code → prefix). Codes past the table are reserved: none. */
const URI_PREFIXES = [
  "",
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:"
];

function utf8(bytes: readonly number[]): string {
  // decodeURIComponent of percent-escapes: UTF-8 without TextDecoder, which Hermes may lack.
  try {
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
  } catch {
    return "";
  }
}

/** Payload of an RTD URI record. */
export function decodeUriPayload(payload: readonly number[]): string {
  if (payload.length === 0) return "";
  return (URI_PREFIXES[payload[0]] ?? "") + utf8(payload.slice(1));
}

/** Payload of an RTD Text record (UTF-8 only: BoltCards never write UTF-16). */
export function decodeTextPayload(payload: readonly number[]): string {
  if (payload.length === 0) return "";
  const status = payload[0];
  if (status & 0x80) return "";
  const languageLength = status & 0x3f;
  return utf8(payload.slice(1 + languageLength));
}

export type RawRecord = {
  /** Type Name Format: 1 = NFC Forum well-known type, 3 = absolute URI. */
  tnf: number;
  /** The record type, as bytes or as text ("U", "T"). */
  type: readonly number[] | string;
  payload: readonly number[];
};

function typeText(type: RawRecord["type"]): string {
  return typeof type === "string" ? type : String.fromCharCode(...type);
}

/** The first LNURL-looking text of the records (`lnurlw://…`, `lnurl1…`, `https://…`), or null. */
export function lnurlFromRecords(records: readonly RawRecord[]): string | null {
  for (const record of records) {
    let text: string | null = null;
    const kind = typeText(record.type);
    if (record.tnf === 1 && kind === "U") text = decodeUriPayload(record.payload);
    else if (record.tnf === 1 && kind === "T") text = decodeTextPayload(record.payload);
    else if (record.tnf === 3) text = kind;
    if (text && /^(lnurlw:\/\/|lightning:|lnurl1|https:\/\/)/i.test(text.trim())) {
      return text.trim();
    }
  }
  return null;
}
