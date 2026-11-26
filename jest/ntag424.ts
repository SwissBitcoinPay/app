import { cbc, cmac, ecb } from "@noble/ciphers/aes.js";
import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";

/*
 * A fake NTAG 424 DNA at the APDU level, for the card driver's tests (src/lib/card/ntag424.ts,
 * program.ts). Written from the NT4H2421Gx data sheet and NXP AN12196, apart from the app's code:
 * its own AES, CMAC and CRC, so that a mistake in the driver is not repeated here.
 *
 * What it implements: ISOSelectFile (NDEF application by DF name, files by id), ISOReadBinary,
 * ReadData and WriteData (CommMode.Plain files), GetKeyVersion, GetVersion (plain),
 * AuthenticateEV2First, GetCardUID, ChangeFileSettings, ChangeKey and SetConfiguration (option 00h,
 * Random ID) in CommMode.Full, with the transaction identifier and the command counter of secure
 * messaging; Secure Dynamic Messaging on the NDEF file (PICCData encrypted, SDM MAC, read counter
 * and its increment rules, reset when SDM is enabled); the failed authentications count; Random ID
 * (`anticollisionUid`: a new random 4-byte UID at each activation once it is on, never undone). Any
 * error while authenticated ends the authentication, as the card does.
 *
 * `interruptAt` takes the card out of the field at a given APDU, before or after the card handled
 * it: a programming or reset interrupted anywhere; `interruptAtCommand`, at the next APDU of an
 * instruction (0xC4, ChangeKey: a reset's first write).
 */

const BLOCK = 16;
const ZERO_IV = new Uint8Array(BLOCK);
const NDEF_DF_NAME = Uint8Array.of(0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01);

/** Raised by `transceive` when the card left the field. */
export class TagLostError extends Error {
  constructor() {
    super("Tag was lost");
    this.name = "TagLostError";
  }
}

type FileSettings = {
  sdm: boolean;
  commMode: number;
  /** Access conditions: key number 0..4, 0xE free, 0xF never. */
  read: number;
  write: number;
  readWrite: number;
  change: number;
  uidMirror: boolean;
  ctrMirror: boolean;
  metaRead: number;
  fileRead: number;
  ctrRet: number;
  piccOffset: number;
  macInputOffset: number;
  macOffset: number;
};

/** The NDEF file at delivery (data sheet Table 8): read, write, read-write free, change key 0. */
function factoryNdefSettings(): FileSettings {
  return {
    sdm: false,
    commMode: 0,
    read: 0xe,
    write: 0xe,
    readWrite: 0xe,
    change: 0,
    uidMirror: false,
    ctrMirror: false,
    metaRead: 0xf,
    fileRead: 0xf,
    ctrRet: 0xf,
    piccOffset: 0,
    macInputOffset: 0,
    macOffset: 0
  };
}

type Session = { keyNo: number; ti: Uint8Array; ctr: number; enc: Uint8Array; mac: Uint8Array };

/** Where the card leaves the field: at an APDU's index, or at the next APDU of an instruction. */
type Interruption = ({ at: number } | { ins: number }) & { handled: boolean };

function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

function upperHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function macTruncated(key: Uint8Array, data: Uint8Array): Uint8Array {
  const full = cmac(data, key);
  return Uint8Array.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

function rotl(bytes: Uint8Array): Uint8Array {
  return concatBytes(bytes.subarray(1), bytes.subarray(0, 1));
}

/** IEEE 802.3 CRC-32 without its final inversion, least significant byte first. */
function jamCrc(data: Uint8Array): Uint8Array {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  crc >>>= 0;
  return Uint8Array.of(crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24);
}

function le3(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
}

class CardStatus extends Error {
  constructor(readonly sw: number) {
    super(`SW ${sw.toString(16)}`);
  }
}

export class FakeNtag424 {
  readonly uid: Uint8Array;
  /** Application keys 0 to 4 and their versions. */
  readonly keys: Uint8Array[] = Array.from({ length: 5 }, () => new Uint8Array(16));
  readonly keyVersions: number[] = [0, 0, 0, 0, 0];
  /** Files 01h (CC), 02h (NDEF), 03h (proprietary). */
  readonly files: Record<number, Uint8Array> = {
    1: new Uint8Array(32),
    2: new Uint8Array(256),
    3: new Uint8Array(128)
  };
  ndefSettings: FileSettings = factoryNdefSettings();
  sdmReadCtr = 0;
  /** AuthenticateEV2First part 2 refused (wrong key), in total. */
  failedAuthentications = 0;
  /** Random ID configured (SetConfiguration): in effect from the next activation, for good. */
  randomId = false;
  /** Every APDU received, in order. */
  readonly received: Uint8Array[] = [];

  private appSelected = false;
  private selectedFile: number | null = null;
  private session: Session | null = null;
  private pendingAuth: { keyNo: number; rndB: Uint8Array } | null = null;
  /** The frames of a GetVersion still to send. */
  private pendingVersion: Uint8Array[] = [];
  /** Random ID as of the last activation: a change needs a power cycle (data sheet §8.1.1). */
  private randomIdActive = false;
  private randomUid: Uint8Array | null = null;
  /** The instruction of the last command handled: a read repeated does not count again. */
  private lastIns: number | null = null;
  private interruption: Interruption | null = null;
  private pause: { at: number; until: Promise<void> } | null = null;

  constructor(
    uid = "04996c6a926980",
    private readonly random: (length: number) => Uint8Array = (length) =>
      globalThis.crypto.getRandomValues(new Uint8Array(length))
  ) {
    this.uid = hexBytes(uid);
  }

  /** A new field: no selection, no authentication (a new tap). */
  powerCycle(): void {
    this.appSelected = false;
    this.selectedFile = null;
    this.session = null;
    this.pendingAuth = null;
    this.pendingVersion = [];
    this.lastIns = null;
    this.randomIdActive = this.randomId;
    // Single size, its first byte 08h (ISO/IEC 14443-3), as AN12196 §6.2 shows it.
    this.randomUid = this.randomId ? concatBytes(Uint8Array.of(0x08), this.random(3)) : null;
  }

  /**
   * The UID the card gave at anticollision in its current field (what the phone reads as `tag.id`):
   * its own, or a random 4-byte one with Random ID.
   */
  anticollisionUid(): Uint8Array {
    return this.randomIdActive && this.randomUid ? this.randomUid.slice() : this.uid.slice();
  }

  /**
   * Takes the card out of the field at the APDU of index `at` (0: the next one): before handling
   * it, or once handled but before its response reaches the phone (`handled`).
   */
  interruptAt(at: number, handled = false): void {
    this.interruption = { at: this.received.length + at, handled };
  }

  /**
   * Takes the card out of the field at the next APDU of instruction `ins` (0x5F, ChangeFileSettings:
   * a reset's first write): before handling it, or once handled but before its response reaches
   * the phone (`handled`).
   */
  interruptAtCommand(ins: number, handled = false): void {
    this.interruption = { ins, handled };
  }

  /**
   * Holds the APDU of index `at` (0: the next one) until the function returned is called: the card
   * in the field, being written to.
   */
  pauseAt(at: number): () => void {
    let resume!: () => void;
    const until = new Promise<void>((resolve) => {
      resume = resolve;
    });
    this.pause = { at: this.received.length + at, until };
    return resume;
  }

  /** Whether the card is authenticated (for the tests). */
  get authenticated(): boolean {
    return this.session !== null;
  }

  /** The command counter of the open session (for the tests). */
  get commandCounter(): number | null {
    return this.session?.ctr ?? null;
  }

  readonly transceive = async (apdu: Uint8Array): Promise<Uint8Array> => {
    if (this.pause?.at === this.received.length) {
      const { until } = this.pause;
      this.pause = null;
      await until;
    }
    const index = this.received.length;
    this.received.push(apdu.slice());
    const planned = this.interruption;
    const cut =
      planned && ("at" in planned ? planned.at === index : planned.ins === apdu[1])
        ? planned
        : null;
    if (cut && !cut.handled) {
      this.interruption = null;
      this.powerCycle();
      throw new TagLostError();
    }
    const response = this.handle(apdu);
    if (cut) {
      this.interruption = null;
      this.powerCycle();
      throw new TagLostError();
    }
    return response;
  };

  /**
   * What a point of sale reads at a tap: a new field, the NDEF application and file selected,
   * the file read whole (ISOReadBinary, as NDEF readers do), its URI record decoded.
   */
  tap(): string {
    this.powerCycle();
    this.handle(concatBytes(Uint8Array.of(0x00, 0xa4, 0x04, 0x0c, 0x07), NDEF_DF_NAME));
    this.handle(Uint8Array.of(0x00, 0xa4, 0x00, 0x0c, 0x02, 0xe1, 0x04));
    const read = this.handle(Uint8Array.of(0x00, 0xb0, 0x00, 0x00, 0x80));
    const status = (read[read.length - 2] << 8) | read[read.length - 1];
    if (status !== 0x9000) throw new Error(`Tap read failed: ${status.toString(16)}`);
    const file = read.subarray(0, read.length - 2);
    const length = (file[0] << 8) | file[1];
    if (length === 0) return "";
    // A short URI record: D1 01 <payload length> 55 <identifier code> <URI>.
    const payload = file.subarray(6, 6 + file[4]);
    return String.fromCharCode(...payload.subarray(1));
  }

  private handle(apdu: Uint8Array): Uint8Array {
    try {
      const data = this.dispatch(apdu);
      return concatBytes(data.body, Uint8Array.of(data.sw >> 8, data.sw & 0xff));
    } catch (error) {
      if (!(error instanceof CardStatus)) throw error;
      // Any error ends the authentication (data sheet §9.1.9).
      this.session = null;
      this.pendingAuth = null;
      return Uint8Array.of(error.sw >> 8, error.sw & 0xff);
    } finally {
      this.lastIns = apdu[1] ?? null;
    }
  }

  private dispatch(apdu: Uint8Array): { body: Uint8Array; sw: number } {
    const [cla, ins] = apdu;
    if (cla === 0x00) return this.iso(apdu);
    if (cla !== 0x90) throw new CardStatus(0x6e00);
    // Native command: 90 INS 00 00 [Lc data] 00.
    const lc = apdu.length > 5 ? apdu[4] : 0;
    if (apdu.length !== (lc > 0 ? 6 + lc : 5)) throw new CardStatus(0x917e);
    const data = apdu.subarray(5, 5 + lc);
    if (ins !== 0xaf && this.pendingAuth) {
      // Any other command aborts an authentication in progress.
      this.pendingAuth = null;
    }
    const versionFrames = this.pendingVersion;
    this.pendingVersion = [];
    if (ins === 0xaf && versionFrames.length > 0) return this.nextVersionFrame(versionFrames);
    if (!this.appSelected) throw new CardStatus(0x919d);
    switch (ins) {
      case 0x71:
        return this.authenticateFirst(data);
      case 0xaf:
        return this.authenticatePart2(data);
      case 0x64:
        return this.getKeyVersion(data);
      case 0x60:
        return this.getVersion(data);
      case 0x5c:
        return this.setConfiguration(data);
      case 0x51:
        return this.getCardUid(data);
      case 0xad:
        return this.readData(data);
      case 0x8d:
        return this.writeData(data);
      case 0x5f:
        return this.changeFileSettings(data);
      case 0xc4:
        return this.changeKey(data);
      default:
        throw new CardStatus(0x911c);
    }
  }

  // ISO 7816-4 interindustry commands, always plain.
  private iso(apdu: Uint8Array): { body: Uint8Array; sw: number } {
    const ins = apdu[1];
    if (ins === 0xa4) {
      const p1 = apdu[2];
      const lc = apdu[4];
      const data = apdu.subarray(5, 5 + lc);
      if (p1 === 0x04 && equalBytes(data, NDEF_DF_NAME)) {
        this.appSelected = true;
        this.selectedFile = null;
        this.session = null;
        return { body: new Uint8Array(0), sw: 0x9000 };
      }
      if ((p1 === 0x00 || p1 === 0x02) && this.appSelected && data.length === 2) {
        const id = (data[0] << 8) | data[1];
        const file = { 0xe103: 1, 0xe104: 2, 0xe105: 3 }[id];
        if (file === undefined) throw new CardStatus(0x6a82);
        this.selectedFile = file;
        return { body: new Uint8Array(0), sw: 0x9000 };
      }
      throw new CardStatus(0x6a82);
    }
    if (ins === 0xb0) {
      if (this.session) throw new CardStatus(0x6982);
      if (this.selectedFile === null) throw new CardStatus(0x6985);
      const offset = (apdu[2] << 8) | apdu[3];
      const le = apdu[4] === 0 ? 256 : apdu[4];
      const content = this.readFile(this.selectedFile, offset, le, ins);
      return { body: content, sw: 0x9000 };
    }
    throw new CardStatus(0x6d00);
  }

  private authenticateFirst(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (data.length < 2) throw new CardStatus(0x917e);
    const keyNo = data[0];
    if (keyNo > 4) throw new CardStatus(0x9140);
    this.session = null;
    const rndB = this.random(16);
    this.pendingAuth = { keyNo, rndB };
    return {
      body: cbc(this.keys[keyNo], ZERO_IV, { disablePadding: true }).encrypt(rndB),
      sw: 0x91af
    };
  }

  private authenticatePart2(data: Uint8Array): { body: Uint8Array; sw: number } {
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    if (!pending) throw new CardStatus(0x91ca);
    if (data.length !== 32) throw new CardStatus(0x917e);
    const key = this.keys[pending.keyNo];
    const plain = cbc(key, ZERO_IV, { disablePadding: true }).decrypt(data);
    const rndA = plain.subarray(0, 16);
    if (!equalBytes(plain.subarray(16), rotl(pending.rndB))) {
      this.failedAuthentications++;
      throw new CardStatus(0x91ae);
    }
    const ti = this.random(4);
    const rndB = pending.rndB;
    const mix = Uint8Array.from({ length: 6 }, (_, i) => rndA[2 + i] ^ rndB[i]);
    const tail = concatBytes(rndA.subarray(0, 2), mix, rndB.subarray(6), rndA.subarray(8));
    this.session = {
      keyNo: pending.keyNo,
      ti,
      ctr: 0,
      enc: cmac(concatBytes(hexBytes("a55a00010080"), tail), key),
      mac: cmac(concatBytes(hexBytes("5aa500010080"), tail), key)
    };
    const answer = concatBytes(ti, rotl(rndA), new Uint8Array(12));
    return { body: cbc(key, ZERO_IV, { disablePadding: true }).encrypt(answer), sw: 0x9100 };
  }

  private ctrBytes(ctr: number): Uint8Array {
    return Uint8Array.of(ctr & 0xff, ctr >> 8);
  }

  /** Checks a command's MAC (CommMode.MAC and Full); returns the data before it. */
  private checkMac(ins: number, header: Uint8Array, rest: Uint8Array): Uint8Array {
    const session = this.session!;
    if (rest.length < 8) throw new CardStatus(0x917e);
    const body = rest.subarray(0, rest.length - 8);
    const expected = macTruncated(
      session.mac,
      concatBytes(Uint8Array.of(ins), this.ctrBytes(session.ctr), session.ti, header, body)
    );
    if (!equalBytes(expected, rest.subarray(rest.length - 8))) throw new CardStatus(0x911e);
    if (session.ctr >= 0xffff) throw new CardStatus(0x911e);
    return body;
  }

  private iv(label: string, ctr: number): Uint8Array {
    const session = this.session!;
    const block = new Uint8Array(BLOCK);
    block.set(concatBytes(hexBytes(label), session.ti, this.ctrBytes(ctr)));
    return ecb(session.enc, { disablePadding: true }).encrypt(block);
  }

  private decryptCommand(body: Uint8Array): Uint8Array {
    const session = this.session!;
    if (body.length === 0 || body.length % BLOCK !== 0) throw new CardStatus(0x917e);
    const plain = cbc(session.enc, this.iv("a55a", session.ctr), { disablePadding: true }).decrypt(
      body
    );
    let end = plain.length - 1;
    while (end >= 0 && plain[end] === 0) end--;
    if (end < 0 || plain[end] !== 0x80 || plain.length - end > BLOCK) {
      throw new CardStatus(0x911e);
    }
    return plain.slice(0, end);
  }

  /** The response of a MACed or full command: the counter counted, data encrypted if full. */
  private respond(data: Uint8Array, full: boolean): { body: Uint8Array; sw: number } {
    const session = this.session!;
    session.ctr++;
    let body = data;
    if (full && data.length > 0) {
      const padded = new Uint8Array((Math.floor(data.length / BLOCK) + 1) * BLOCK);
      padded.set(data);
      padded[data.length] = 0x80;
      body = cbc(session.enc, this.iv("5aa5", session.ctr), { disablePadding: true }).encrypt(
        padded
      );
    }
    const mac = macTruncated(
      session.mac,
      concatBytes(Uint8Array.of(0x00), this.ctrBytes(session.ctr), session.ti, body)
    );
    return { body: concatBytes(body, mac), sw: 0x9100 };
  }

  private getKeyVersion(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (this.session) {
      const body = this.checkMac(0x64, data.subarray(0, 1), data.subarray(1));
      if (body.length !== 0) throw new CardStatus(0x917e);
      const keyNo = data[0];
      if (keyNo > 4) throw new CardStatus(0x9140);
      return this.respond(Uint8Array.of(this.keyVersions[keyNo]), false);
    }
    if (data.length !== 1) throw new CardStatus(0x917e);
    if (data[0] > 4) throw new CardStatus(0x9140);
    return { body: Uint8Array.of(this.keyVersions[data[0]]), sw: 0x9100 };
  }

  /** GetVersion, plain (unauthenticated): three frames, the UID zeros with Random ID (Table 58). */
  private getVersion(data: Uint8Array): { body: Uint8Array; sw: number } {
    // Authenticated, it goes in CommMode.MAC: the driver never sends it so.
    if (this.session || data.length !== 0) throw new CardStatus(0x917e);
    const production = concatBytes(
      this.randomId ? new Uint8Array(7) : this.uid,
      // BatchNo, BatchNo/FabKey, FabKey/CWProd, YearProd, as AN12196 Table 12.
      hexBytes("cd65935d402118")
    );
    return this.nextVersionFrame([
      hexBytes("04040830001105"),
      hexBytes("04040201011105"),
      production
    ]);
  }

  private nextVersionFrame(frames: Uint8Array[]): { body: Uint8Array; sw: number } {
    const [frame, ...rest] = frames;
    this.pendingVersion = rest;
    return { body: frame, sw: rest.length > 0 ? 0x91af : 0x9100 };
  }

  /** SetConfiguration, option 00h only (PICC configuration: Random ID), key 0's session. */
  private setConfiguration(data: Uint8Array): { body: Uint8Array; sw: number } {
    const session = this.session;
    if (!session || session.keyNo !== 0) throw new CardStatus(0x919d);
    if (data.length < 1) throw new CardStatus(0x917e);
    const option = data[0];
    const body = this.checkMac(0x5c, data.subarray(0, 1), data.subarray(1));
    const plain = this.decryptCommand(body);
    if (option !== 0x00) throw new CardStatus(0x919e);
    if (plain.length !== 1 || (plain[0] & 0xfd) !== 0) throw new CardStatus(0x917e);
    // UseRID: 1b enables it, 0b is "no change".
    if (plain[0] & 0x02) this.randomId = true;
    return this.respond(new Uint8Array(0), false);
  }

  private getCardUid(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (!this.session) throw new CardStatus(0x91ae);
    const body = this.checkMac(0x51, new Uint8Array(0), data);
    if (body.length !== 0) throw new CardStatus(0x917e);
    return this.respond(this.uid, true);
  }

  private settingsOf(fileNo: number): FileSettings {
    if (fileNo === 2) return this.ndefSettings;
    // The CC and proprietary files keep their delivery settings here.
    return fileNo === 1
      ? { ...factoryNdefSettings(), write: 0, readWrite: 0 }
      : { ...factoryNdefSettings(), commMode: 3, read: 2, write: 3, readWrite: 3 };
  }

  private grants(condition: number): boolean {
    return condition === 0xe || (this.session !== null && this.session.keyNo === condition);
  }

  /** The file's content as read: mirrored when SDM applies (not authenticated). */
  private readFile(fileNo: number, offset: number, length: number, ins: number): Uint8Array {
    const settings = this.settingsOf(fileNo);
    const file = this.files[fileNo];
    const free = this.grants(settings.read) || this.grants(settings.readWrite);
    const sdm = fileNo === 2 && settings.sdm && !this.session;
    if (!free && !(sdm && settings.fileRead !== 0xf)) {
      throw new CardStatus(ins === 0xb0 ? 0x6982 : 0x91ae);
    }
    if (offset >= file.length) throw new CardStatus(ins === 0xb0 ? 0x6a86 : 0x91be);
    const content = file.slice();
    if (sdm) {
      // The read counter goes up at the first read after any other command (data sheet §9.3.1).
      if (this.lastIns !== ins) {
        if (this.sdmReadCtr >= 0xffffff) throw new CardStatus(ins === 0xb0 ? 0x6982 : 0x919d);
        this.sdmReadCtr++;
      }
      this.mirror(content);
    }
    return content.slice(offset, Math.min(file.length, offset + length));
  }

  private mirror(content: Uint8Array): void {
    const s = this.ndefSettings;
    const ctr = Uint8Array.of(
      this.sdmReadCtr & 0xff,
      (this.sdmReadCtr >> 8) & 0xff,
      this.sdmReadCtr >> 16
    );
    if (s.metaRead <= 4) {
      const picc = concatBytes(
        Uint8Array.of(0xc7),
        this.uid,
        ctr,
        // Random padding (AN12196 §3.4.2.1).
        this.random(5)
      );
      const enc = ecb(this.keys[s.metaRead], { disablePadding: true }).encrypt(picc);
      content.set(
        Array.from(upperHex(enc), (ch) => ch.charCodeAt(0)),
        s.piccOffset
      );
    }
    if (s.fileRead <= 4) {
      const sv2 = concatBytes(hexBytes("3cc300010080"), this.uid, ctr);
      const sessionKey = cmac(sv2, this.keys[s.fileRead]);
      const input = content.subarray(s.macInputOffset, s.macOffset);
      const mac = macTruncated(sessionKey, input);
      content.set(
        Array.from(upperHex(mac), (ch) => ch.charCodeAt(0)),
        s.macOffset
      );
    }
  }

  private readData(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (data.length !== 7) throw new CardStatus(0x917e);
    const fileNo = data[0];
    if (!(fileNo in this.files)) throw new CardStatus(0x91f0);
    const offset = le3(data, 1);
    const length = le3(data, 4) || this.files[fileNo].length - offset;
    if (offset + length > this.files[fileNo].length) throw new CardStatus(0x91be);
    const content = this.readFile(fileNo, offset, length, 0xad);
    if (this.session) {
      // CommMode.Plain of the file while authenticated: counted, no MAC (data sheet §9.1.8).
      if (this.settingsOf(fileNo).commMode !== 0) throw new CardStatus(0x919d);
      this.session.ctr++;
    }
    return { body: content, sw: 0x9100 };
  }

  private writeData(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (data.length < 8) throw new CardStatus(0x917e);
    const fileNo = data[0];
    if (!(fileNo in this.files)) throw new CardStatus(0x91f0);
    const settings = this.settingsOf(fileNo);
    if (!this.grants(settings.write) && !this.grants(settings.readWrite)) {
      throw new CardStatus(this.session ? 0x919d : 0x91ae);
    }
    if (this.session && settings.commMode !== 0) throw new CardStatus(0x919d);
    const offset = le3(data, 1);
    const length = le3(data, 4);
    const content = data.subarray(7);
    if (content.length !== length) throw new CardStatus(0x917e);
    if (offset + length > this.files[fileNo].length) throw new CardStatus(0x91be);
    this.files[fileNo].set(content, offset);
    if (this.session) this.session.ctr++;
    return { body: new Uint8Array(0), sw: 0x9100 };
  }

  private changeFileSettings(data: Uint8Array): { body: Uint8Array; sw: number } {
    if (!this.session) throw new CardStatus(0x91ae);
    const fileNo = data[0];
    const body = this.checkMac(0x5f, data.subarray(0, 1), data.subarray(1));
    const plain = this.decryptCommand(body);
    if (fileNo !== 2) throw new CardStatus(0x919d);
    if (!this.grants(this.ndefSettings.change)) throw new CardStatus(0x91ae);
    this.ndefSettings = this.parseSettings(plain);
    return this.respond(new Uint8Array(0), false);
  }

  private parseSettings(plain: Uint8Array): FileSettings {
    if (plain.length < 3) throw new CardStatus(0x917e);
    const option = plain[0];
    const settings: FileSettings = {
      ...factoryNdefSettings(),
      sdm: (option & 0x40) !== 0,
      commMode: option & 0x03,
      readWrite: plain[1] >> 4,
      change: plain[1] & 0x0f,
      read: plain[2] >> 4,
      write: plain[2] & 0x0f
    };
    if (!settings.sdm) {
      if (plain.length !== 3) throw new CardStatus(0x917e);
      return settings;
    }
    if (plain.length < 6) throw new CardStatus(0x917e);
    const options = plain[3];
    settings.uidMirror = (options & 0x80) !== 0;
    settings.ctrMirror = (options & 0x40) !== 0;
    // Only what BoltCards use: encrypted PICCData, no SDMENCFileData, no read limit, ASCII.
    if ((options & 0x30) !== 0 || (options & 0x01) !== 1) throw new CardStatus(0x919e);
    settings.ctrRet = plain[4] & 0x0f;
    settings.metaRead = plain[5] >> 4;
    settings.fileRead = plain[5] & 0x0f;
    if (settings.metaRead > 4 || settings.fileRead > 4) throw new CardStatus(0x919e);
    if (plain.length !== 15) throw new CardStatus(0x917e);
    settings.piccOffset = le3(plain, 6);
    settings.macInputOffset = le3(plain, 9);
    settings.macOffset = le3(plain, 12);
    const size = this.files[2].length;
    const overlap =
      settings.piccOffset < settings.macOffset + 16 &&
      settings.macOffset < settings.piccOffset + 32;
    if (
      settings.piccOffset + 32 > size ||
      settings.macOffset + 16 > size ||
      settings.macInputOffset > settings.macOffset ||
      overlap
    ) {
      throw new CardStatus(0x919e);
    }
    // The read counter starts again when SDM is enabled (data sheet §9.3.1).
    this.sdmReadCtr = 0;
    return settings;
  }

  private changeKey(data: Uint8Array): { body: Uint8Array; sw: number } {
    const session = this.session;
    if (!session || session.keyNo !== 0) throw new CardStatus(0x91ae);
    const keyNo = data[0];
    const body = this.checkMac(0xc4, data.subarray(0, 1), data.subarray(1));
    const plain = this.decryptCommand(body);
    if (keyNo > 4) throw new CardStatus(0x9140);
    if (keyNo === 0) {
      if (plain.length !== 17) throw new CardStatus(0x917e);
      this.keys[0] = plain.slice(0, 16);
      this.keyVersions[0] = plain[16];
      // The session's own key changed: no MAC on the answer, no authentication any more.
      session.ctr++;
      this.session = null;
      return { body: new Uint8Array(0), sw: 0x9100 };
    }
    if (plain.length !== 21) throw new CardStatus(0x917e);
    const newKey = Uint8Array.from(plain.subarray(0, 16), (b, i) => b ^ this.keys[keyNo][i]);
    if (!equalBytes(jamCrc(newKey), plain.subarray(17, 21))) throw new CardStatus(0x911e);
    this.keys[keyNo] = newKey;
    this.keyVersions[keyNo] = plain[16];
    return this.respond(new Uint8Array(0), false);
  }
}

/**
 * A FakeNtag424 set up as a v2 card (card-migration tests): programmed with the
 * v2 SDM keys (K0, K1, K2; K3/K4 the factory zeros), SDM on over an NDEF file holding
 * `lnurlw://<host>/cards?p=&c=`, which the card mirrors at each read with K1 (PICCData) and K2 (MAC)
 * — as sattleme/app's cards were. `uid` is 7 bytes, lowercase hex.
 */
export function legacyNtag424({
  uid,
  host,
  master,
  meta,
  file
}: {
  uid: string;
  host: string;
  master: Uint8Array;
  meta: Uint8Array;
  file: Uint8Array;
}): FakeNtag424 {
  const card = new FakeNtag424(uid);
  const url = `lnurlw://${host}/cards?p=${"0".repeat(32)}&c=${"0".repeat(16)}`;
  const payload = [0x00, ...Array.from(url, (c) => c.charCodeAt(0))];
  const record = [0xd1, 0x01, payload.length, 0x55, ...payload];
  const bytes = [record.length >> 8, record.length & 0xff, ...record];
  card.files[2] = new Uint8Array(256);
  card.files[2].set(bytes, 0);
  // NLEN (2) + record header (4) + URI identifier code (1) come before the URL.
  const urlStart = 7;
  const piccOffset = urlStart + url.indexOf("?p=") + 3;
  const macOffset = urlStart + url.indexOf("&c=") + 3;
  card.ndefSettings = {
    sdm: true,
    commMode: 0,
    read: 0xe,
    write: 0,
    readWrite: 0,
    change: 0,
    uidMirror: true,
    ctrMirror: true,
    metaRead: 1,
    fileRead: 2,
    ctrRet: 0xf,
    piccOffset,
    // The MAC over an empty input, as BoltCards are programmed.
    macInputOffset: macOffset,
    macOffset
  };
  card.keys[0] = master.slice();
  card.keys[1] = meta.slice();
  card.keys[2] = file.slice();
  card.keyVersions[0] = 1;
  card.keyVersions[1] = 1;
  card.keyVersions[2] = 1;
  // A card already tapped (the v2 service refuses read_ctr 0).
  card.sdmReadCtr = 5;
  // v2 cards have Random ID: anticollision gives a random UID at each tap.
  card.randomId = true;
  card.powerCycle();
  return card;
}
