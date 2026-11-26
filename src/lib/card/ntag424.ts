import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";

import { secureRandomBytes } from "@/lib/random";

import {
  KEY_LENGTH,
  SecureSession,
  crc32nk,
  decryptBlocks,
  encryptBlocks,
  rotateLeft,
  sessionKeys
} from "./ntag424-sm";
import { UID_LENGTH } from "./sun";

/*
 * The commands of an NTAG 424 DNA (NT4H2421Gx data sheet §10) the app sends to program a BoltCard
 * and to reset it, over ISO-DEP (ISO 7816-4 APDUs). Only what BoltCards need: selecting the NDEF
 * application, reading and writing a file in CommMode.Plain, the key versions, GetVersion,
 * AuthenticateEV2First and the CommMode.Full commands GetCardUID, ChangeFileSettings, ChangeKey and
 * SetConfiguration, for Random ID only (AN12196 §6.2): never another of its options.
 *
 * Everything the card answers is checked before use: status words, lengths, the MAC of every
 * response in secure messaging. An answer out of shape ends the session (CardError).
 */

/** Sends one APDU to the card and gives back its response: data, then SW1 SW2. */
export type Transceive = (apdu: Uint8Array) => Promise<Uint8Array>;

export type CardErrorCode =
  /** The tag left the field, or the connection failed. */
  | "connection"
  /** Not an NTAG 424 DNA, or not one the app can talk to. */
  | "unsupported"
  /** The key was refused (AuthenticateEV2First). */
  | "authFailed"
  /** The card answered something unexpected: a status, a length or a MAC. */
  | "protocol";

export class CardError extends Error {
  readonly code: CardErrorCode;
  /** SW1 SW2 of the answer, when the card gave one. */
  readonly status: number | null;

  constructor(code: CardErrorCode, message: string, status: number | null = null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CardError";
    this.code = code;
    this.status = status;
  }
}

/** The ISO DF name of the NDEF application (data sheet §8.2.2). */
const NDEF_APPLICATION = Uint8Array.of(0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01);

const SW_OK = 0x9000;
const SW_OK_NATIVE = 0x9100;
const SW_MORE = 0x91af;
const SW_AUTHENTICATION_ERROR = 0x91ae;

const INS_AUTHENTICATE_FIRST = 0x71;
const INS_MORE = 0xaf;
const INS_GET_VERSION = 0x60;
const INS_GET_CARD_UID = 0x51;
const INS_SET_CONFIGURATION = 0x5c;
const INS_GET_KEY_VERSION = 0x64;
const INS_READ_DATA = 0xad;
const INS_WRITE_DATA = 0x8d;
const INS_CHANGE_FILE_SETTINGS = 0x5f;
const INS_CHANGE_KEY = 0xc4;

/** The commands that change what the card holds (its file, file settings, keys, configuration). */
const CHANGING = new Set([
  INS_WRITE_DATA,
  INS_CHANGE_FILE_SETTINGS,
  INS_CHANGE_KEY,
  INS_SET_CONFIGURATION
]);

/** Most bytes the app reads or writes with one command: one short APDU, tearing protected. */
const MAX_DATA = 128;

type Response = { data: Uint8Array; status: number };

function le3(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

function hex(status: number): string {
  return status.toString(16).padStart(4, "0").toUpperCase();
}

/** A native command wrapped in an ISO 7816-4 APDU (data sheet §8.4): CLA 90, Le 00. */
function nativeApdu(ins: number, data: Uint8Array): Uint8Array {
  if (data.length > 255) throw new Error("APDU too long");
  return data.length === 0
    ? Uint8Array.of(0x90, ins, 0x00, 0x00, 0x00)
    : concatBytes(Uint8Array.of(0x90, ins, 0x00, 0x00, data.length), data, Uint8Array.of(0x00));
}

/**
 * One NTAG 424 DNA in the field. Commands go one at a time; `session` is the secure messaging of
 * the last AuthenticateEV2First, gone with any error (data sheet §9.1.9: the card drops its
 * authentication on any failed command) or with a change of the key it was opened with.
 */
export class Ntag424 {
  private session: SecureSession | null = null;
  private changing = 0;
  private uid: Uint8Array | null = null;

  constructor(
    private readonly transceive: Transceive,
    /** RndA of the authentications: secure random, fixed by the tests of AN12196's examples. */
    private readonly random: (length: number) => Uint8Array = secureRandomBytes
  ) {}

  /** Whether an AuthenticateEV2First holds. */
  get authenticated(): boolean {
    return this.session !== null;
  }

  /**
   * How many commands that change what the card holds were sent to it, counted before each is sent
   * (one the card may have handled without answering counts too): what was read of the card with
   * the same count still holds, the card being this one in the field (a card that leaves it ends
   * the session; another is another Ntag424).
   */
  get changes(): number {
    return this.changing;
  }

  /**
   * The UID GetCardUID last gave (its answer's MAC checked), else null: kept past the
   * authentication that read it, for as long as this card is in the field (this Ntag424).
   */
  get knownUid(): Uint8Array | null {
    return this.uid?.slice() ?? null;
  }

  private async send(apdu: Uint8Array): Promise<Response> {
    if (apdu[0] === 0x90 && CHANGING.has(apdu[1])) this.changing++;
    let answer: Uint8Array;
    try {
      answer = await this.transceive(apdu);
    } catch (error) {
      this.session = null;
      throw new CardError("connection", "The card did not answer", null, error);
    }
    if (!(answer instanceof Uint8Array) || answer.length < 2) {
      this.session = null;
      throw new CardError("protocol", "Answer without a status word");
    }
    return {
      data: answer.slice(0, answer.length - 2),
      status: (answer[answer.length - 2] << 8) | answer[answer.length - 1]
    };
  }

  /** A failed command: the card left its authenticated state (data sheet §9.1.9). */
  private failure(what: string, status: number): CardError {
    this.session = null;
    return new CardError("protocol", `${what} failed: ${hex(status)}`, status);
  }

  /** Selects the NDEF application by its DF name: the first command of every exchange. */
  async selectApplication(): Promise<void> {
    const { status } = await this.send(
      // As AN12196 Table 13: P2 0C (no FCI), Le 00.
      concatBytes(
        Uint8Array.of(0x00, 0xa4, 0x04, 0x0c, NDEF_APPLICATION.length),
        NDEF_APPLICATION,
        Uint8Array.of(0x00)
      )
    );
    // Selecting does not keep an authentication the app would rely on.
    this.session = null;
    if (status !== SW_OK) {
      throw new CardError("unsupported", `Not an NTAG 424 DNA: ${hex(status)}`, status);
    }
  }

  /**
   * A plain command, outside secure messaging or counted by it (CommMode.Plain while authenticated,
   * data sheet §9.1.8): its response carries no MAC.
   */
  private async plain(what: string, ins: number, data: Uint8Array): Promise<Uint8Array> {
    const { data: answer, status } = await this.send(nativeApdu(ins, data));
    if (status !== SW_OK_NATIVE) throw this.failure(what, status);
    this.session?.next();
    return answer;
  }

  /** The version of key `keyNo` (0 to 4): 0 on a blank card. Not authenticated only (plain). */
  async getKeyVersion(keyNo: number): Promise<number> {
    if (this.session) throw new Error("GetKeyVersion is sent before authenticating");
    const answer = await this.plain("GetKeyVersion", INS_GET_KEY_VERSION, Uint8Array.of(keyNo));
    if (answer.length !== 1) throw new CardError("protocol", "GetKeyVersion: unexpected length");
    return answer[0];
  }

  /**
   * Whether the card is configured for Random ID (GetVersion, data sheet §10.5.2): the last of its
   * three frames gives the UID, all zeros once Random ID is on (Table 58). Not authenticated only
   * (plain: authenticated, the card would MAC it).
   */
  async randomIdEnabled(): Promise<boolean> {
    if (this.session) throw new Error("GetVersion is sent before authenticating");
    const frames: Uint8Array[] = [];
    for (const ins of [INS_GET_VERSION, INS_MORE, INS_MORE]) {
      const { data, status } = await this.send(nativeApdu(ins, new Uint8Array(0)));
      const last = frames.length === 2;
      if (status !== (last ? SW_OK_NATIVE : SW_MORE)) throw this.failure("GetVersion", status);
      frames.push(data);
    }
    // Hardware and software information (7 bytes each), then UID, BatchNo, FabKey, CWProd and
    // YearProd (14 bytes), with a FabKeyID for customized configurations (15).
    const [hardware, software, production] = frames;
    if (
      hardware.length !== 7 ||
      software.length !== 7 ||
      (production.length !== 14 && production.length !== 15)
    ) {
      throw new CardError("protocol", "GetVersion: unexpected length");
    }
    return production.subarray(0, UID_LENGTH).every((byte) => byte === 0);
  }

  /**
   * `length` bytes of file `fileNo` from `offset`, in CommMode.Plain (the NDEF file's). Not
   * authenticated, the card mirrors its SDM data (`p`, `c`) and counts a read.
   */
  async readData(fileNo: number, offset: number, length: number): Promise<Uint8Array> {
    if (length < 1 || length > MAX_DATA) throw new Error("Read length out of range");
    const answer = await this.plain(
      "ReadData",
      INS_READ_DATA,
      concatBytes(Uint8Array.of(fileNo), le3(offset), le3(length))
    );
    if (answer.length !== length) throw new CardError("protocol", "ReadData: unexpected length");
    return answer;
  }

  /** Writes `data` into file `fileNo` at `offset`, in CommMode.Plain, as one frame. */
  async writeData(fileNo: number, offset: number, data: Uint8Array): Promise<void> {
    if (data.length < 1 || data.length > MAX_DATA) throw new Error("Write length out of range");
    const answer = await this.plain(
      "WriteData",
      INS_WRITE_DATA,
      concatBytes(Uint8Array.of(fileNo), le3(offset), le3(data.length), data)
    );
    if (answer.length !== 0) throw new CardError("protocol", "WriteData: unexpected data");
  }

  /**
   * AuthenticateEV2First with key `keyNo` (data sheet §9.1.5, AN12196 Table 14). A wrong key
   * counts against the card's failed authentications (AN12196 §6.4): callers make sure the key is
   * the card's before trying it.
   */
  async authenticate(keyNo: number, key: Uint8Array): Promise<void> {
    if (key.length !== KEY_LENGTH) throw new Error("An application key has 16 bytes");
    this.session = null;
    const first = await this.send(nativeApdu(INS_AUTHENTICATE_FIRST, Uint8Array.of(keyNo, 0x00)));
    if (first.status !== SW_MORE) throw this.failure("AuthenticateEV2First", first.status);
    if (first.data.length !== 16) throw new CardError("protocol", "Authentication: bad challenge");
    const rndB = decryptBlocks(key, first.data);
    const rndA = this.random(16);
    const second = await this.send(
      nativeApdu(INS_MORE, encryptBlocks(key, concatBytes(rndA, rotateLeft(rndB))))
    );
    if (second.status === SW_AUTHENTICATION_ERROR) {
      throw new CardError("authFailed", "The card refused the key", second.status);
    }
    if (second.status !== SW_OK_NATIVE) throw this.failure("AuthenticateEV2First", second.status);
    if (second.data.length !== 32) throw new CardError("protocol", "Authentication: bad answer");
    const plain = decryptBlocks(key, second.data);
    // TI (4) || RndA' (16) || PDcap2 (6) || PCDcap2 (6): RndA' proves the card holds the key too.
    if (!equalBytes(plain.subarray(4, 20), rotateLeft(rndA))) {
      throw new CardError("authFailed", "The card does not hold the key");
    }
    const { enc, mac } = sessionKeys(key, rndA, rndB);
    this.session = new SecureSession(plain.slice(0, 4), enc, mac);
  }

  /**
   * AuthenticateEV2First's first frame for key `keyNo`, the key held ELSEWHERE (the v2 server, for a
   * v2 card's master key: legacy-card.ts): the card's encrypted challenge, E(K, RndB), for the
   * holder of the key to answer. No session is kept on this side: the commands that follow are the
   * key holder's (`sendRelayed`).
   */
  async beginRelayedAuthentication(keyNo: number): Promise<Uint8Array> {
    this.session = null;
    const first = await this.send(nativeApdu(INS_AUTHENTICATE_FIRST, Uint8Array.of(keyNo, 0x00)));
    if (first.status !== SW_MORE) throw this.failure("AuthenticateEV2First", first.status);
    if (first.data.length !== 16) throw new CardError("protocol", "Authentication: bad challenge");
    return first.data;
  }

  /**
   * The second frame: the key holder's answer, E(K, RndA || RndB'), handed to the card; its own
   * answer, E(K, TI || RndA' || PDcap2 || PCDcap2), for the key holder to check. A refused answer is
   * CardError "authFailed" (the card counts it).
   */
  async completeRelayedAuthentication(answer: Uint8Array): Promise<Uint8Array> {
    if (answer.length !== 32) throw new Error("The reader's answer has 32 bytes");
    const second = await this.send(nativeApdu(INS_MORE, answer));
    if (second.status === SW_AUTHENTICATION_ERROR) {
      throw new CardError("authFailed", "The card refused the key", second.status);
    }
    if (second.status !== SW_OK_NATIVE) throw this.failure("AuthenticateEV2First", second.status);
    if (second.data.length !== 32) throw new CardError("protocol", "Authentication: bad answer");
    return second.data;
  }

  /**
   * A native command the key holder computed for the session it opened (`ins`, then its data:
   * header, encrypted data and MAC), sent as is; the card's answer data, whose MAC only the key
   * holder can check. Anything but 91 00 is a CardError "protocol", the card's authentication gone.
   */
  async sendRelayed(ins: number, data: Uint8Array): Promise<Uint8Array> {
    this.session = null;
    const { data: answer, status } = await this.send(nativeApdu(ins, data));
    if (status !== SW_OK_NATIVE) throw this.failure("Relayed command", status);
    return answer;
  }

  private requireSession(): SecureSession {
    if (!this.session) throw new Error("Not authenticated");
    return this.session;
  }

  /**
   * A command in CommMode.Full (data sheet §9.1.10): CmdData encrypted, then the MAC over the
   * command; the response's MAC checked and its data, if any, decrypted. `endsSession` for a
   * ChangeKey of the key the session was opened with: the card answers without a MAC and drops
   * the authentication (AN12196 Table 26).
   */
  private async full(
    what: string,
    ins: number,
    header: Uint8Array,
    data: Uint8Array,
    endsSession = false
  ): Promise<Uint8Array> {
    const session = this.requireSession();
    const encrypted = data.length > 0 ? session.encryptCommand(data) : data;
    const mac = session.commandMac(ins, header, encrypted);
    const { data: answer, status } = await this.send(
      nativeApdu(ins, concatBytes(header, encrypted, mac))
    );
    if (status !== SW_OK_NATIVE) throw this.failure(what, status);
    if (endsSession) {
      this.session = null;
      if (answer.length !== 0) throw new CardError("protocol", `${what}: unexpected data`);
      return answer;
    }
    session.next();
    if (answer.length < 8) throw this.failure(`${what} (no MAC)`, status);
    const body = answer.subarray(0, answer.length - 8);
    if (!session.responseMacValid(0x00, body, answer.subarray(answer.length - 8))) {
      this.session = null;
      throw new CardError("protocol", `${what}: the card's MAC does not match`);
    }
    if (body.length === 0) return body;
    const plain = session.decryptResponse(body);
    if (!plain) {
      this.session = null;
      throw new CardError("protocol", `${what}: undecryptable answer`);
    }
    return plain;
  }

  /** The card's 7-byte UID (GetCardUID, CommMode.Full). */
  async getCardUid(): Promise<Uint8Array> {
    const uid = await this.full(
      "GetCardUID",
      INS_GET_CARD_UID,
      new Uint8Array(0),
      new Uint8Array(0)
    );
    if (uid.length !== UID_LENGTH) throw new CardError("protocol", "GetCardUID: not a 7-byte UID");
    this.uid = uid.slice();
    return uid;
  }

  /**
   * Turns Random ID on, for good (SetConfiguration, option 00h PICC configuration, UseRID set: data
   * sheet §10.5.1, AN12196 Table 27), authenticated with key 0 (AppMasterKey). From the card's next
   * activation, anticollision gives a new random 4-byte UID at each tap: its own UID is told by
   * GetCardUID only, to whoever holds one of its keys. Cannot be undone; the card's other settings
   * stay as they are (a bit at 0 is "no change").
   */
  async enableRandomId(): Promise<void> {
    await this.full(
      "SetConfiguration",
      INS_SET_CONFIGURATION,
      Uint8Array.of(0x00),
      Uint8Array.of(0x02)
    );
  }

  /** ChangeFileSettings of file `fileNo` with `settings` (FileOption onwards), CommMode.Full. */
  async changeFileSettings(fileNo: number, settings: Uint8Array): Promise<void> {
    await this.full(
      "ChangeFileSettings",
      INS_CHANGE_FILE_SETTINGS,
      Uint8Array.of(fileNo),
      settings
    );
  }

  /**
   * Gives key `keyNo` the value `newKey` and the version `version` (data sheet §10.6.1). Key 0,
   * the session's own: NewKey || KeyVer, and the session ends. Keys 1 to 4: (NewKey ⊕ OldKey) ||
   * KeyVer || CRC32NK(NewKey), which the card checks against the key it holds: a wrong `oldKey` is
   * refused (INTEGRITY_ERROR), never written.
   */
  async changeKey(
    keyNo: number,
    oldKey: Uint8Array,
    newKey: Uint8Array,
    version: number
  ): Promise<void> {
    if (newKey.length !== KEY_LENGTH || oldKey.length !== KEY_LENGTH) {
      throw new Error("An application key has 16 bytes");
    }
    if (!Number.isInteger(version) || version < 0 || version > 0xff) {
      throw new Error("A key version is one byte");
    }
    if (keyNo === 0) {
      await this.full(
        "ChangeKey",
        INS_CHANGE_KEY,
        Uint8Array.of(0),
        concatBytes(newKey, Uint8Array.of(version)),
        true
      );
      return;
    }
    const mixed = new Uint8Array(KEY_LENGTH);
    for (let i = 0; i < KEY_LENGTH; i++) mixed[i] = newKey[i] ^ oldKey[i];
    await this.full(
      "ChangeKey",
      INS_CHANGE_KEY,
      Uint8Array.of(keyNo),
      concatBytes(mixed, Uint8Array.of(version), crc32nk(newKey))
    );
  }
}
