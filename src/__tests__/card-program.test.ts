import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  CardUrlTooLongError,
  MAX_RELAY_HOST_LENGTH,
  cardFileTemplate,
  cardUrl,
  fitsInCard,
  relayOfCardFile
} from "@/lib/card/card-url";
import { cardIdOf, cardKeysOf, deriveCardRoot } from "@/lib/card/keys";
import { CardError, Ntag424 } from "@/lib/card/ntag424";
import { ProgramError, ResetError, programCard, resetCard, shownCardUid } from "@/lib/card/program";
import { checkCardTap } from "@/lib/card/tap";

import { FakeNtag424 } from "../../jest/ntag424";

// BIP-39 test mnemonics (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherRoot = deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));
const HOST = DEFAULT_CARD_RELAY_HOST;

/** `p` and `c` of the URL a point of sale reads. */
function sunOf(url: string): { p: string; c: string } {
  const parsed = new URL(url.replace(/^lnurlw:/, "https:"));
  return { p: parsed.searchParams.get("p") ?? "", c: parsed.searchParams.get("c") ?? "" };
}

function program(fake: FakeNtag424, version = 1, walletRoot = root, relayHost = HOST) {
  return programCard(new Ntag424(fake.transceive), { root: walletRoot, relayHost, version });
}

/** A new tap of the card, reset. */
function reset(fake: FakeNtag424, version = 1) {
  fake.powerCycle();
  return resetCard(new Ntag424(fake.transceive), {
    root,
    cardId: cardIdOf(root, fake.uid),
    version
  });
}

/** The APDUs of SetConfiguration the card received from `from` on. */
function setConfigurations(fake: FakeNtag424, from = 0) {
  return fake.received.slice(from).filter((apdu) => apdu[0] === 0x90 && apdu[1] === 0x5c).length;
}

/** The card holds this wallet's keys at `version`, Random ID on, and its taps verify. */
function expectProgrammed(fake: FakeNtag424, version = 1) {
  expect(fake.randomId).toBe(true);
  const keys = cardKeysOf(root, fake.uid, version);
  expect(fake.keys).toEqual([keys.k0, keys.k1, keys.k2, keys.k3, keys.k4]);
  expect(fake.keyVersions).toEqual([version, version, version, version, version]);
  const url = fake.tap();
  expect(url).toMatch(/^lnurlw:\/\/relay\.sattle\.me\/w\?p=[0-9A-F]{32}&c=[0-9A-F]{16}$/);
  const { p, c } = sunOf(url);
  const check = checkCardTap(
    { root, cardId: cardIdOf(root, fake.uid), version, lastCounter: 0 },
    p,
    c
  );
  expect(check).toMatchObject({ ok: true, counter: fake.sdmReadCtr });
}

/** The card is as delivered: zero keys at version 0, no SDM, an empty NDEF file. */
function expectBlank(fake: FakeNtag424) {
  expect(fake.keys.every((key) => key.every((b) => b === 0))).toBe(true);
  expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);
  expect(fake.ndefSettings.sdm).toBe(false);
  expect(fake.ndefSettings).toMatchObject({ read: 0xe, write: 0xe, readWrite: 0xe, change: 0 });
  expect(Array.from(fake.files[2].subarray(0, 2))).toEqual([0, 0]);
  expect(fake.tap()).toBe("");
}

/** An NDEF file holding `url` in the record a card file has (cardFileTemplate). */
function fileOf(url: string): Uint8Array {
  const bytes = Array.from(url, (ch) => ch.charCodeAt(0));
  const record = [0xd1, 0x01, bytes.length + 1, 0x55, 0x00, ...bytes];
  const file = new Uint8Array(256);
  file.set([record.length >> 8, record.length & 0xff, ...record]);
  return file;
}

/** The index of the first APDU of a whole programming with instruction `ins`. */
async function firstCommand(ins: number, relayHost = HOST): Promise<number> {
  const probe = new FakeNtag424();
  await program(probe, 1, root, relayHost);
  return probe.received.findIndex((apdu) => apdu[1] === ins);
}

/** The authentications sent from APDU `from` on. */
function authenticationsSince(fake: FakeNtag424, from: number) {
  return fake.received.slice(from).filter((apdu) => apdu[0] === 0x90 && apdu[1] === 0x71).length;
}

describe("programming a blank card", () => {
  it("programs it, checks a tap read back, and its taps verify", async () => {
    const fake = new FakeNtag424();
    const programmed = await program(fake);

    expect(programmed).toEqual({
      uid: fake.uid,
      cardId: cardIdOf(root, fake.uid),
      version: 1,
      counter: 1
    });
    expectProgrammed(fake);
    expect(fake.failedAuthentications).toBe(0);
    // The settings of a BoltCard: SDM on the placeholders of its URL, read free, keys 1 and 2.
    const template = cardFileTemplate(HOST);
    expect(fake.ndefSettings).toMatchObject({
      sdm: true,
      read: 0xe,
      write: 0,
      readWrite: 0,
      change: 0,
      metaRead: 1,
      fileRead: 2,
      ctrRet: 0xf,
      piccOffset: template.pOffset,
      macInputOffset: template.cOffset,
      macOffset: template.cOffset
    });
  });

  it("asks the keys' version of the card once its UID is known", async () => {
    const fake = new FakeNtag424();
    const asked: string[] = [];
    const versionOf = (uid: Uint8Array, found: "tap" | "blank") => {
      asked.push(`${Array.from(uid, (b) => b.toString(16).padStart(2, "0")).join("")} ${found}`);
      return 3;
    };
    const programmed = await programCard(new Ntag424(fake.transceive), {
      root,
      relayHost: HOST,
      version: versionOf
    });
    expect(programmed.version).toBe(3);
    expect(asked).toEqual(["04996c6a926980 blank"]);
    expectProgrammed(fake, 3);

    // Its check interrupted: the next attempt reads the UID from the tap, and ends there.
    const again = await programCard(new Ntag424(fake.transceive), {
      root,
      relayHost: HOST,
      version: versionOf
    });
    expect(again).toMatchObject({ version: 3, cardId: programmed.cardId });
    expect(asked).toEqual(["04996c6a926980 blank", "04996c6a926980 tap"]);
    await expect(
      programCard(new Ntag424(fake.transceive), { root, relayHost: HOST, version: () => 0 })
    ).rejects.toThrow(/version/);
  });

  it("turns Random ID on: anticollision no longer gives its UID, GetCardUID still does", async () => {
    const fake = new FakeNtag424();
    expect(fake.anticollisionUid()).toEqual(fake.uid);
    const programmed = await program(fake);

    expect(setConfigurations(fake)).toBe(1);
    expect(fake.randomId).toBe(true);
    // Before the SDM settings and the keys: the card shown to be the one expected first.
    const setConfiguration = fake.received.findIndex((apdu) => apdu[1] === 0x5c);
    expect(setConfiguration).toBeGreaterThan(fake.received.findIndex((apdu) => apdu[1] === 0x51));
    expect(setConfiguration).toBeLessThan(fake.received.findIndex((apdu) => apdu[1] === 0x5f));
    // Each tap a new single-size UID (08h first), never the card's own.
    fake.powerCycle();
    const first = fake.anticollisionUid();
    fake.powerCycle();
    const second = fake.anticollisionUid();
    for (const uid of [first, second]) {
      expect(uid).toHaveLength(4);
      expect(uid[0]).toBe(0x08);
    }
    expect(first).not.toEqual(second);
    // The UID the keys derive from is the card's own, read with GetCardUID.
    expect(programmed.uid).toEqual(fake.uid);
    expectProgrammed(fake);
  });

  it("turns Random ID on once: a card reset and programmed again keeps it", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1);
    await expect(reset(fake)).resolves.toBe(true);
    expectBlank(fake);
    expect(fake.randomId).toBe(true);
    const from = fake.received.length;

    fake.powerCycle();
    await program(fake, 2);
    expect(setConfigurations(fake, from)).toBe(0);
    expectProgrammed(fake, 2);
    expect(fake.failedAuthentications).toBe(0);

    // A card someone else configured so: programmed as any blank card.
    const configured = new FakeNtag424("04a39493cc8680");
    configured.randomId = true;
    configured.powerCycle();
    await program(configured);
    expect(setConfigurations(configured)).toBe(0);
    expectProgrammed(configured);
  });

  it("never turns Random ID on for a card that is not the one expected", async () => {
    const fake = new FakeNtag424();
    await expect(
      programCard(new Ntag424(fake.transceive), {
        root,
        relayHost: HOST,
        version: () => {
          throw new Error("Another card");
        }
      })
    ).rejects.toThrow("Another card");
    expect(setConfigurations(fake)).toBe(0);
    expect(fake.randomId).toBe(false);
    expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);

    // Not blank: refused before any authentication, nothing configured.
    const other = new FakeNtag424();
    await program(other, 1, otherRoot);
    other.randomId = false;
    const from = other.received.length;
    await expect(program(other)).rejects.toMatchObject({ code: "notBlank" });
    expect(setConfigurations(other, from)).toBe(0);
    expect(other.randomId).toBe(false);
  });

  it("stops when the card refuses Random ID, its keys and settings untouched", async () => {
    const fake = new FakeNtag424();
    const refusing = async (apdu: Uint8Array) =>
      apdu[1] === 0x5c ? Uint8Array.of(0x91, 0x9d) : fake.transceive(apdu);

    await expect(
      programCard(new Ntag424(refusing), { root, relayHost: HOST, version: 1 })
    ).rejects.toMatchObject({ code: "protocol", status: 0x919d });
    expect(fake.randomId).toBe(false);
    expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(fake.ndefSettings.sdm).toBe(false);
  });

  it("refuses another wallet's card without authenticating", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1, otherRoot);
    const from = fake.received.length;

    await expect(program(fake)).rejects.toMatchObject({ code: "notBlank" });
    expect(authenticationsSince(fake, from)).toBe(0);
    expect(fake.failedAuthentications).toBe(0);
  });

  it("refuses its own card at another version or for another relay: it must be reset first", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1);
    const from = fake.received.length;

    await expect(program(fake, 2)).rejects.toMatchObject({ code: "ownCard" });
    await expect(program(fake, 2)).rejects.toBeInstanceOf(ProgramError);
    await expect(program(fake, 1, root, "relay.example.org")).rejects.toMatchObject({
      code: "notBlank"
    });
    expect(authenticationsSince(fake, from)).toBe(0);
    expectProgrammed(fake, 1);
  });

  it("programs a card whose programming for another relay stopped before its SDM settings", async () => {
    // A longer host and a shorter one than the default relay's: the file is written whole again.
    for (const other of ["relay.example.org", "r.example"]) {
      const fake = new FakeNtag424();
      // Left before ChangeFileSettings: its keys blank, the other relay's placeholders in its file.
      fake.interruptAt(await firstCommand(0x5f, other));
      await expect(program(fake, 1, root, other)).rejects.toMatchObject({ code: "connection" });
      expect(relayOfCardFile(fake.files[2])).toBe(other);
      expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);

      const programmed = await program(fake);
      expect(programmed).toMatchObject({ cardId: cardIdOf(root, fake.uid), version: 1 });
      expectProgrammed(fake);
      expect(fake.failedAuthentications).toBe(0);
    }
  });

  it("never makes good again a tap read from a card left half-programmed", async () => {
    // Left before its key 3: keys 1 and 2 set, its SDM settings in place.
    const fake = new FakeNtag424();
    const probe = new FakeNtag424();
    await program(probe);
    const keyChanges = probe.received.flatMap((apdu, i) => (apdu[1] === 0xc4 ? [i] : []));
    fake.interruptAt(keyChanges[2]);
    await expect(program(fake)).rejects.toMatchObject({ code: "connection" });
    expect(fake.keyVersions).toEqual([0, 1, 1, 0, 0]);
    // Read meanwhile, a few times: by a point of sale, say.
    fake.tap();
    fake.tap();
    const read = sunOf(fake.tap());

    const programmed = await program(fake);
    expectProgrammed(fake);
    const check = checkCardTap(
      { root, cardId: programmed.cardId, version: 1, lastCounter: programmed.counter },
      read.p,
      read.c
    );
    expect(check.ok).toBe(false);
  });

  it("refuses a card holding a card file's URL without its placeholders, keys blank", async () => {
    const fake = new FakeNtag424();
    // A tap written as is (no SDM): not a programming that stopped, someone else's content.
    fake.files[2].set(fileOf(cardUrl("relay.example.org", "A".repeat(32), "B".repeat(16))));
    const before = fake.files[2].slice();

    await expect(program(fake)).rejects.toMatchObject({ code: "notBlank" });
    expect(authenticationsSince(fake, 0)).toBe(0);
    expect(fake.files[2]).toEqual(before);
  });

  it("refuses a card with an NDEF message of its own, without authenticating", async () => {
    const fake = new FakeNtag424();
    const url = Array.from("https://example.org/", (ch) => ch.charCodeAt(0));
    fake.files[2].set([0, url.length + 5, 0xd1, 0x01, url.length + 1, 0x55, 0x00, ...url]);
    const before = fake.files[2].slice();

    await expect(program(fake)).rejects.toMatchObject({ code: "notBlank" });
    expect(authenticationsSince(fake, 0)).toBe(0);
    expect(fake.files[2]).toEqual(before);
  });

  it("stops at the first refusal of key 0 when its version says blank", async () => {
    const fake = new FakeNtag424();
    // Another issuer changed key 0 but left its version at 0.
    fake.keys[0] = Uint8Array.from({ length: 16 }, (_, i) => i + 1);

    await expect(program(fake)).rejects.toMatchObject({ code: "notBlank" });
    expect(fake.failedAuthentications).toBe(1);
    expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("refuses a relay whose URL does not fit in one write, before talking to the card", async () => {
    const fake = new FakeNtag424();
    const host = `${"a".repeat(50)}.example`;

    await expect(program(fake, 1, root, host)).rejects.toBeInstanceOf(CardUrlTooLongError);
    expect(fake.received).toHaveLength(0);
  });

  it("holds a relay host of MAX_RELAY_HOST_LENGTH characters, never one more", () => {
    // "Change relay" says 56.
    expect(MAX_RELAY_HOST_LENGTH).toBe(56);
    const longest = `${"a".repeat(MAX_RELAY_HOST_LENGTH - ".example".length)}.example`;
    expect(longest).toHaveLength(MAX_RELAY_HOST_LENGTH);
    expect(fitsInCard(longest)).toBe(true);
    expect(cardFileTemplate(longest).bytes).toHaveLength(128);
    expect(fitsInCard(`a${longest}`)).toBe(false);
  });

  it("refuses a card that is not an NTAG 424 DNA", async () => {
    const ntag = new Ntag424(async () => Uint8Array.of(0x6a, 0x82));
    await expect(programCard(ntag, { root, relayHost: HOST, version: 1 })).rejects.toMatchObject({
      code: "unsupported"
    });
  });

  describe("taken away from the phone at any command", () => {
    // The APDUs of a whole programming.
    const total = (() => {
      const fake = new FakeNtag424();
      return program(fake).then(() => fake.received.length);
    })();

    it.each([false, true])(
      "goes on at the next attempt (card gone after handling the command: %s)",
      async (handled) => {
        const count = await total;
        expect(count).toBeGreaterThan(10);
        for (let at = 0; at < count; at++) {
          const fake = new FakeNtag424();
          fake.interruptAt(at, handled);
          const first = await program(fake).catch((error: unknown) => error);
          expect(first).toBeInstanceOf(CardError);
          expect(first).toMatchObject({ code: "connection" });

          const programmed = await program(fake);
          expect(programmed.cardId).toBe(cardIdOf(root, fake.uid));
          expectProgrammed(fake);
          expect(fake.failedAuthentications).toBe(0);
        }
      }
    );
  });
});

describe("the relay a card's file names", () => {
  it("is read from its placeholders or its taps, whichever relay", async () => {
    const longest = `${"a".repeat(MAX_RELAY_HOST_LENGTH - ".example".length)}.example`;
    for (const host of [HOST, "relay.example.org:8443", longest]) {
      expect(relayOfCardFile(cardFileTemplate(host).bytes)).toBe(host);
      const fake = new FakeNtag424();
      await program(fake, 1, root, host);
      expect(relayOfCardFile(fake.files[2])).toBe(host);
      // As a point of sale reads it, its tap mirrored.
      const read = Array.from(fake.tap(), (ch) => ch.charCodeAt(0));
      const record = [0xd1, 0x01, read.length + 1, 0x55, 0x00, ...read];
      expect(relayOfCardFile(Uint8Array.from([0, record.length, ...record]))).toBe(host);
    }
  });

  it("is none for any other content", async () => {
    const zeros = { p: "0".repeat(32), c: "0".repeat(16) };
    // A blank card, another URL, another scheme, another path, a host never written as is.
    expect(relayOfCardFile(new Uint8Array(256))).toBeNull();
    expect(relayOfCardFile(fileOf("https://example.org/"))).toBeNull();
    expect(relayOfCardFile(fileOf(`https://${HOST}/w?p=${zeros.p}&c=${zeros.c}`))).toBeNull();
    expect(relayOfCardFile(fileOf(`lnurlw://${HOST}/x?p=${zeros.p}&c=${zeros.c}`))).toBeNull();
    expect(
      relayOfCardFile(fileOf(`lnurlw://Relay.Sattle.me/w?p=${zeros.p}&c=${zeros.c}`))
    ).toBeNull();
    expect(relayOfCardFile(fileOf(`lnurlw://${HOST}:443/w?p=${zeros.p}&c=${zeros.c}`))).toBeNull();
    // Its `p` or `c` not hex, a parameter more, the record cut short.
    expect(
      relayOfCardFile(fileOf(`lnurlw://${HOST}/w?p=${"x".repeat(32)}&c=${zeros.c}`))
    ).toBeNull();
    expect(relayOfCardFile(fileOf(`${cardUrl(HOST, zeros.p, zeros.c)}&d=1`))).toBeNull();
    expect(relayOfCardFile(cardFileTemplate(HOST).bytes.subarray(0, 40))).toBeNull();
  });
});

describe("resetting a card", () => {
  it("brings it back to a blank card, which can be programmed again at the next version", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1);

    await expect(reset(fake)).resolves.toBe(true);
    expectBlank(fake);
    await expect(reset(fake)).resolves.toBe(false);

    await program(fake, 2);
    expectProgrammed(fake, 2);
    expect(fake.failedAuthentications).toBe(0);
  });

  it("refuses a card that is not the expected one, without authenticating", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1, otherRoot);
    const from = fake.received.length;

    await expect(reset(fake)).rejects.toBeInstanceOf(ResetError);
    expect(authenticationsSince(fake, from)).toBe(0);

    const mine = new FakeNtag424("04a39493cc8680");
    await program(mine, 1);
    const fromMine = mine.received.length;
    // Its own card, but another one than expected, or at another version.
    await expect(
      resetCard(new Ntag424(mine.transceive), {
        root,
        cardId: cardIdOf(root, fake.uid),
        version: 1
      })
    ).rejects.toMatchObject({ code: "notThisCard" });
    await expect(reset(mine, 2)).rejects.toMatchObject({ code: "notThisCard" });
    expect(authenticationsSince(mine, fromMine)).toBe(0);
    expect(mine.failedAuthentications).toBe(0);
    expectProgrammed(mine);
  });

  it("resets a card programmed for another relay, which its file names", async () => {
    const fake = new FakeNtag424();
    await program(fake, 3, root, "relay.example.org");

    await expect(reset(fake, 3)).resolves.toBe(true);
    expectBlank(fake);
    expect(fake.failedAuthentications).toBe(0);
  });

  it("undoes this wallet's programming stopped at any command before its key 0", async () => {
    const probe = new FakeNtag424();
    await program(probe, 2, root, "relay.example.org");
    const count = probe.received.length;
    for (let at = 0; at < count; at++) {
      for (const handled of [false, true]) {
        const fake = new FakeNtag424();
        fake.interruptAt(at, handled);
        await program(fake, 2, root, "relay.example.org").catch(() => undefined);
        // Programmed whole once handled at its last command: reset as any card.
        await reset(fake, 2);
        expectBlank(fake);
        expect(fake.failedAuthentications).toBe(0);
      }
    }
  });

  it("leaves another wallet's programming stopped before its key 0, without authenticating", async () => {
    const probe = new FakeNtag424();
    await program(probe, 1, otherRoot);
    const keyChanges = probe.received.flatMap((apdu, i) => (apdu[1] === 0xc4 ? [i] : []));
    const fake = new FakeNtag424();
    // Its keys 1 and 2 set by the other wallet, key 0 still blank.
    fake.interruptAt(keyChanges[2]);
    await expect(program(fake, 1, otherRoot)).rejects.toMatchObject({ code: "connection" });
    const from = fake.received.length;
    const keys = fake.keys.map((key) => key.slice());

    // Key 0 blank, but the tap it mirrors is the other wallet's: never this wallet's card.
    await expect(reset(fake, 1)).rejects.toMatchObject({ code: "notThisCard" });
    expect(authenticationsSince(fake, from)).toBe(0);
    expect(fake.keys).toEqual(keys);
    expect(fake.ndefSettings.sdm).toBe(true);
  });

  describe("taken away from the phone at any command", () => {
    const total = (async () => {
      const fake = new FakeNtag424();
      await program(fake);
      const from = fake.received.length;
      await reset(fake);
      return fake.received.length - from;
    })();

    it.each([false, true])(
      "goes on at the next attempt (card gone after handling the command: %s)",
      async (handled) => {
        const count = await total;
        for (let at = 0; at < count; at++) {
          const fake = new FakeNtag424();
          await program(fake);
          fake.interruptAt(at, handled);
          const first = await reset(fake).catch((error: unknown) => error);
          expect(first).toMatchObject({ code: "connection" });
          // Until every key is blank, SDM stays on: the card shows a tap. Then its blank key 0
          // tells its UID: never the tag's, random with Random ID.
          if (!fake.keyVersions.every((v) => v === 0)) expect(fake.ndefSettings.sdm).toBe(true);

          await reset(fake);
          expectBlank(fake);
          expect(fake.failedAuthentications).toBe(0);
        }
      }
    );

    it("refuses, without authenticating, a card showing no tap while its key 0 is not blank", async () => {
      // Not a state a reset of this wallet leaves (its keys before SDM): SDM off, keys at version 1.
      const fake = new FakeNtag424();
      await program(fake);
      fake.ndefSettings = {
        ...fake.ndefSettings,
        sdm: false,
        read: 0xe,
        write: 0xe,
        readWrite: 0xe
      };
      const from = fake.received.length;

      await expect(reset(fake)).rejects.toMatchObject({ code: "notThisCard" });
      expect(authenticationsSince(fake, from)).toBe(0);
      expect(fake.keyVersions).toEqual([1, 1, 1, 1, 1]);
    });
  });
});

describe("one tap, several steps", () => {
  /** How many APDUs of instruction `ins` the card received from `from` on. */
  function sent(fake: FakeNtag424, ins: number, from: number) {
    return fake.received.slice(from).filter((apdu) => apdu[0] === 0x90 && apdu[1] === ins).length;
  }

  /** As "Add a card" takes a card reset: its UID, its reset, its programming. */
  async function addAgain(fake: FakeNtag424, version: number) {
    fake.powerCycle();
    const card = new Ntag424(fake.transceive);
    const uid = await shownCardUid(card, root, null);
    expect(uid).toEqual(fake.uid);
    await resetCard(card, { root, cardId: cardIdOf(root, uid!), version: version - 1 });
    return programCard(card, { root, relayHost: HOST, version });
  }

  it("read the card's state once while nothing changes it", async () => {
    const fake = new FakeNtag424();
    await program(fake);
    await reset(fake);
    const from = fake.received.length;

    await addAgain(fake, 2);
    expectProgrammed(fake, 2);
    // One read of its keys' versions and its file (and the tap read back to check it), one
    // authentication with the blank key 0 to tell its UID, one to program it.
    expect(sent(fake, 0x64, from)).toBe(5);
    expect(sent(fake, 0xad, from)).toBe(2);
    expect(sent(fake, 0x71, from)).toBe(2);
    expect(fake.failedAuthentications).toBe(0);
  });

  it("ask the UID the card gave in the session once", async () => {
    // A reset stopped once SDM was off, before its file was emptied: keys blank, placeholders.
    const fake = new FakeNtag424();
    await program(fake);
    fake.powerCycle();
    fake.interruptAtCommand(0x8d);
    await expect(reset(fake)).rejects.toMatchObject({ code: "connection" });
    expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(fake.ndefSettings.sdm).toBe(false);
    const from = fake.received.length;

    await addAgain(fake, 2);
    expectProgrammed(fake, 2);
    // Its UID told once (shownCardUid), then the reset's session, then the programming's.
    expect(sent(fake, 0x51, from)).toBe(3);
    expect(sent(fake, 0x71, from)).toBe(3);
    expect(fake.failedAuthentications).toBe(0);
  });

  it("read the card again once a command changed it, even from elsewhere", async () => {
    const fake = new FakeNtag424();
    const card = new Ntag424(fake.transceive);
    expect(await shownCardUid(card, root, null)).toEqual(fake.uid);
    // Another NDEF message written meanwhile on the same card, in the same session.
    const url = Array.from("https://example.org/", (ch) => ch.charCodeAt(0));
    await card.writeData(
      2,
      0,
      Uint8Array.of(0, url.length + 5, 0xd1, 0x01, url.length + 1, 0x55, 0x00, ...url)
    );

    await expect(programCard(card, { root, relayHost: HOST, version: 1 })).rejects.toMatchObject({
      code: "notBlank"
    });
    expect(fake.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("read the state of a relay change's reset back before programming on it", async () => {
    const fake = new FakeNtag424();
    await program(fake, 1);
    fake.powerCycle();
    const card = new Ntag424(fake.transceive);
    const from = fake.received.length;

    await expect(
      resetCard(card, { root, cardId: cardIdOf(root, fake.uid), version: 1 })
    ).resolves.toBe(true);
    await programCard(card, { root, relayHost: "relay.example.org", version: 2 });
    // Read before the reset, read back after it (the check that it is blank), programmed on that.
    expect(sent(fake, 0xad, from)).toBe(3);
    expect(sent(fake, 0x64, from)).toBe(10);
    expect(relayOfCardFile(fake.files[2])).toBe("relay.example.org");
    expect(fake.keyVersions).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("a tap of a paired card", () => {
  it("is good once, with a counter above the last one seen", async () => {
    const fake = new FakeNtag424();
    const { counter } = await program(fake);
    const expected = { root, cardId: cardIdOf(root, fake.uid), version: 1, lastCounter: counter };

    const first = sunOf(fake.tap());
    const checked = checkCardTap(expected, first.p, first.c);
    expect(checked).toEqual({ ok: true, counter: counter + 1, uid: fake.uid });

    // Replayed: the same tap again.
    expect(checkCardTap({ ...expected, lastCounter: counter + 1 }, first.p, first.c)).toEqual({
      ok: false,
      reason: "replayed"
    });
    const second = sunOf(fake.tap());
    expect(
      checkCardTap({ ...expected, lastCounter: counter + 1 }, second.p, second.c)
    ).toMatchObject({
      ok: true,
      counter: counter + 2
    });
    // An older tap, read by someone near the card and kept, after a newer one.
    expect(checkCardTap({ ...expected, lastCounter: counter + 2 }, first.p, first.c)).toMatchObject(
      {
        reason: "replayed"
      }
    );
  });

  it("is refused when altered, of another card or out of shape", async () => {
    const fake = new FakeNtag424();
    await program(fake);
    const expected = { root, cardId: cardIdOf(root, fake.uid), version: 1, lastCounter: 0 };
    const { p, c } = sunOf(fake.tap());
    const flipped = `${c.slice(0, 15)}${c[15] === "0" ? "1" : "0"}`;

    expect(checkCardTap(expected, p, flipped)).toEqual({ ok: false, reason: "badMac" });
    expect(checkCardTap({ ...expected, version: 2 }, p, c)).toEqual({
      ok: false,
      reason: "badMac"
    });
    expect(checkCardTap({ ...expected, cardId: "0".repeat(32) }, p, c)).toEqual({
      ok: false,
      reason: "otherCard"
    });
    expect(checkCardTap({ ...expected, root: otherRoot }, p, c)).toMatchObject({ ok: false });
    expect(checkCardTap(expected, p.slice(1), c)).toEqual({ ok: false, reason: "malformed" });
    expect(checkCardTap(expected, null, c)).toEqual({ ok: false, reason: "malformed" });

    const other = new FakeNtag424("04a39493cc8680");
    await program(other, 1, otherRoot);
    const foreign = sunOf(other.tap());
    expect(checkCardTap(expected, foreign.p, foreign.c)).toMatchObject({ ok: false });
  });

  it("is what a point of sale reads: the relay's LNURL-withdraw (LUD-17)", async () => {
    const fake = new FakeNtag424();
    await program(fake);
    const url = fake.tap();
    const { p, c } = sunOf(url);
    expect(url).toBe(cardUrl(HOST, p, c));
  });
});
