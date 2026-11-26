import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { CardError, Ntag424 } from "@/lib/card/ntag424";
import {
  SecureSession,
  ZERO_KEY,
  crc32nk,
  encryptBlocks,
  pad,
  sessionKeys,
  unpad
} from "@/lib/card/ntag424-sm";
import { decryptPiccData, sessionMacKey, sunMac } from "@/lib/card/sun";

import { FakeNtag424 } from "../../jest/ntag424";

/*
 * The worked examples of NXP AN12196 (Rev. 2.0), step by step: the driver's secure messaging and
 * its APDUs must give the same bytes.
 */

const h = (hex: string) => hexToBytes(hex.replace(/\s/g, "").toLowerCase());
const upper = (bytes: Uint8Array) => bytesToHex(bytes).toUpperCase();

/** A card that answers a fixed script of APDUs, and fails the test on any other. */
function scripted(steps: { expect: string; answer: string }[]) {
  const sent: string[] = [];
  const transceive = async (apdu: Uint8Array) => {
    const step = steps[sent.length];
    sent.push(upper(apdu));
    if (!step) throw new Error(`Unexpected APDU ${upper(apdu)}`);
    expect(upper(apdu)).toBe(step.expect.replace(/\s/g, ""));
    return h(step.answer);
  };
  return { transceive, sent };
}

describe("NTAG 424 DNA secure messaging (AN12196)", () => {
  it("derives the session keys of AuthenticateEV2First (Tables 14, 19, 23)", () => {
    const table14 = sessionKeys(
      ZERO_KEY,
      h("13C5DB8A5930439FC3DEF9A4C675360F"),
      h("B9E2FC789B64BF237CCCAA20EC7E6E48")
    );
    expect(upper(table14.enc)).toBe("1309C877509E5A215007FF0ED19CA564");
    expect(upper(table14.mac)).toBe("4C6626F5E72EA694202139295C7A7FC7");

    const table19 = sessionKeys(
      ZERO_KEY,
      h("B98F4C50CF1C2E084FD150E33992B048"),
      h("91517975190DCEA6104948EFA3085C1B")
    );
    expect(upper(table19.enc)).toBe("7A93D6571E4B180FCA6AC90C9A7488D4");
    expect(upper(table19.mac)).toBe("FC4AF159B62E549B5812394CAB1918CC");

    const table23 = sessionKeys(
      ZERO_KEY,
      h("60BE759EDA560250AC57CDDC11743CF6"),
      h("6924E8D09722659A2E7DEC68E66312B8")
    );
    expect(upper(table23.enc)).toBe("4CF3CB41A22583A61E89B158D252FC53");
    expect(upper(table23.mac)).toBe("5529860B2FC5FB6154B7F28361D30BF9");
  });

  it("MACs a command and checks its answer in CommMode.MAC (Table 7, GetFileSettings)", () => {
    const session = new SecureSession(
      h("7A21085E"),
      ZERO_KEY,
      h("8248134A386E86EB7FAF54A52E536CB6")
    );
    expect(upper(session.commandMac(0xf5, h("02"), new Uint8Array(0)))).toBe("6597A457C8CD442C");
    session.next();
    const data = h("0040EEEE000100D1FE001F00004400004400002000006A0000");
    expect(session.responseMacValid(0x00, data, h("2A474282E7A47986"))).toBe(true);
    expect(session.responseMacValid(0x00, data, h("2A474282E7A47987"))).toBe(false);
    data[0] ^= 1;
    expect(session.responseMacValid(0x00, data, h("2A474282E7A47986"))).toBe(false);
  });

  it("changes a key other than the session's (Table 25)", () => {
    const session = new SecureSession(
      h("7614281A"),
      h("4CF3CB41A22583A61E89B158D252FC53"),
      h("5529860B2FC5FB6154B7F28361D30BF9")
    );
    session.next();
    session.next();
    const newKey = h("F3847D627727ED3BC9C4CC050489B966");
    expect(upper(crc32nk(newKey))).toBe("789DFADC");
    // Old key zeros: NewKey ⊕ OldKey is the new key itself.
    const keyData = new Uint8Array([...newKey, 0x01, ...crc32nk(newKey)]);
    const encrypted = session.encryptCommand(keyData);
    expect(upper(encrypted)).toBe(
      "2CF362B7BF4311FF3BE1DAA295E8C68DE09050560D19B9E16C2393AE9CD1FAC7"
    );
    expect(upper(session.commandMac(0xc4, h("02"), encrypted))).toBe("5D0CE20BCD1D06E6");
    session.next();
    expect(session.responseMacValid(0x00, new Uint8Array(0), h("203BB55D1089D587"))).toBe(true);
  });

  it("changes the session's own key 0 (Table 26)", () => {
    const session = new SecureSession(
      h("7614281A"),
      h("4CF3CB41A22583A61E89B158D252FC53"),
      h("5529860B2FC5FB6154B7F28361D30BF9")
    );
    for (let i = 0; i < 3; i++) session.next();
    const keyData = new Uint8Array([...h("5004BF991F408672B1EF00F08F9E8647"), 0x01]);
    const encrypted = session.encryptCommand(keyData);
    expect(upper(encrypted)).toBe(
      "C0EB4DEEFEDDF0B513A03A95A75491818580503190D4D05053FF75668A01D6FD"
    );
    expect(upper(session.commandMac(0xc4, h("00"), encrypted))).toBe("A6610234BDED6432");
  });

  it("decrypts GetCardUID's answer in CommMode.Full (Table 28)", () => {
    const session = new SecureSession(
      h("DF055522"),
      h("2B4D963C014DC36F24F69A50A394F875"),
      h("379D32130CE61705DD5FD8C36B95D764")
    );
    expect(upper(session.commandMac(0x51, new Uint8Array(0), new Uint8Array(0)))).toBe(
      "8E2C155ADDA99BE3"
    );
    session.next();
    const answer = h("70756055688505B52A5E26E59E329CD6");
    expect(session.responseMacValid(0x00, answer, h("595F672298EA41B7"))).toBe(true);
    expect(upper(session.decryptResponse(answer)!)).toBe("04958CAA5C5E80");
  });

  it("enables Random ID in CommMode.Full (Table 27, SetConfiguration)", () => {
    const session = new SecureSession(
      h("D779B1D0"),
      h("7951A705F47F3C29B596454DC1490383"),
      h("FE4EDBF46536557E304682F33E63A84F")
    );
    const encrypted = session.encryptCommand(h("02"));
    expect(upper(encrypted)).toBe("8EA0138A7AF6FC8E99DF2A3A305602C4");
    const mac = session.commandMac(0x5c, h("00"), encrypted);
    expect(upper(mac)).toBe("3A7A3C9228C3134A");
    expect(`905C000019 00 ${upper(encrypted)} ${upper(mac)} 00`.replace(/\s/g, "")).toBe(
      "905C000019008EA0138A7AF6FC8E99DF2A3A305602C43A7A3C9228C3134A00"
    );
    session.next();
    expect(session.responseMacValid(0x00, new Uint8Array(0), h("86044208CAD1676A"))).toBe(true);
  });

  it("pads always, by ISO/IEC 9797-1 method 2, and refuses any other padding", () => {
    expect(upper(pad(h("02")))).toBe("02800000000000000000000000000000");
    expect(pad(new Uint8Array(16))).toHaveLength(32);
    expect(unpad(pad(h("0102")))).toEqual(h("0102"));
    expect(unpad(new Uint8Array(16))).toBeNull();
    expect(unpad(h("01800000000000000000000000000001"))).toBeNull();
    expect(unpad(new Uint8Array([0x80, ...new Uint8Array(16)]))).toBeNull();
  });

  it("mirrors SUN as AN12196 §3 computes it", () => {
    expect(
      upper(sessionMacKey(h("5ACE7E50AB65D5D51FD5BF5A16B8205B"), h("04C767F2066180"), 1))
    ).toBe("3A3E8110E05311F7A3FCF0D969BF2B48");
    expect(decryptPiccData(ZERO_KEY, h("EF963FF7828658A599F3041510671E88"))).toEqual({
      uid: h("04DE5F1EACC040"),
      counter: 0x3d
    });
    expect(upper(sunMac(ZERO_KEY, h("04DE5F1EACC040"), 0x3d))).toBe("94EED9EE65337086");
  });
});

describe("Ntag424 APDUs (AN12196)", () => {
  const RND_A = "13C5DB8A5930439FC3DEF9A4C675360F";
  const AUTH = [
    { expect: "9071000002000000", answer: "A04C124213C186F22399D33AC2A3021591AF" },
    {
      expect: "90AF000020 35C3E05A752E0144BAC0DE51C1F22C56B34408A23D8AEA266CAB947EA8E0118D 00",
      answer: "3FA64DB5446D1F34CD6EA311167F5E4985B89690C04A05F17FA7AB2F081206639100"
    }
  ];

  it("selects the NDEF application by its DF name (Table 13)", async () => {
    const card = scripted([{ expect: "00A4040C07D276000085010100", answer: "9000" }]);
    await new Ntag424(card.transceive).selectApplication();
    expect(card.sent).toHaveLength(1);
  });

  it("authenticates as Table 14, then sends ChangeFileSettings as Table 18", async () => {
    const card = scripted([
      ...AUTH,
      // Any command counted by the session: CmdCtr 1 for ChangeFileSettings, as in Table 18.
      { expect: "908D00000802000000010000AA00", answer: "9100" },
      {
        expect: "905F0000190261B6D97903566E84C3AE5274467E89EAD799B7C1A0EF7A0400",
        answer: "57BFF87B1241E93D9100"
      }
    ]);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    await ntag.authenticate(0, ZERO_KEY);
    expect(ntag.authenticated).toBe(true);
    await ntag.writeData(2, 0, h("AA"));
    await ntag.changeFileSettings(2, h("4000E0C1F121200000430000430000"));
    expect(card.sent).toHaveLength(4);
    expect(ntag.authenticated).toBe(true);
  });

  it("reads GetVersion's three frames (Table 12): Random ID on when its UID is zeros", async () => {
    const frames = (production: string) =>
      scripted([
        { expect: "9060000000", answer: "0404083000110591AF" },
        { expect: "90AF000000", answer: "0404020101110591AF" },
        { expect: "90AF000000", answer: `${production}9100` }
      ]);
    const plain = frames("04968CAA5C5E80CD65935D402118");
    await expect(new Ntag424(plain.transceive).randomIdEnabled()).resolves.toBe(false);
    expect(plain.sent).toHaveLength(3);
    const random = frames("00000000000000CD65935D402118");
    await expect(new Ntag424(random.transceive).randomIdEnabled()).resolves.toBe(true);
    // With a FabKeyID (customized configurations).
    const fabKey = frames("00000000000000CD65935D4021181F");
    await expect(new Ntag424(fabKey.transceive).randomIdEnabled()).resolves.toBe(true);

    const short = frames("04968CAA5C5E80");
    await expect(new Ntag424(short.transceive).randomIdEnabled()).rejects.toThrow(/length/);
    const refused = scripted([{ expect: "9060000000", answer: "917E" }]);
    await expect(new Ntag424(refused.transceive).randomIdEnabled()).rejects.toMatchObject({
      code: "protocol",
      status: 0x917e
    });
  });

  it("sends GetVersion before authenticating only", async () => {
    const card = scripted(AUTH);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    await ntag.authenticate(0, ZERO_KEY);
    await expect(ntag.randomIdEnabled()).rejects.toThrow(/before authenticating/);
    expect(card.sent).toHaveLength(2);
  });

  it("refuses an answer whose MAC is not the card's, and drops the session", async () => {
    const card = scripted([
      ...AUTH,
      { expect: "908D00000802000000010000AA00", answer: "9100" },
      {
        expect: "905F0000190261B6D97903566E84C3AE5274467E89EAD799B7C1A0EF7A0400",
        answer: "57BFF87B1241E93E9100"
      }
    ]);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    await ntag.authenticate(0, ZERO_KEY);
    await ntag.writeData(2, 0, h("AA"));
    await expect(ntag.changeFileSettings(2, h("4000E0C1F121200000430000430000"))).rejects.toThrow(
      /MAC/
    );
    expect(ntag.authenticated).toBe(false);
  });

  it("refuses a card that does not give RndA' back", async () => {
    const wrong = encryptBlocks(ZERO_KEY, new Uint8Array(32));
    const card = scripted([AUTH[0], { expect: AUTH[1].expect, answer: `${upper(wrong)}9100` }]);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    await expect(ntag.authenticate(0, ZERO_KEY)).rejects.toMatchObject({ code: "authFailed" });
    expect(ntag.authenticated).toBe(false);
  });

  it("tells a refused key from other failures", async () => {
    const card = scripted([AUTH[0], { expect: AUTH[1].expect, answer: "91AE" }]);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    const error = await ntag.authenticate(0, ZERO_KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CardError);
    expect(error).toMatchObject({ code: "authFailed", status: 0x91ae });
  });

  it("reports a card gone and an answer without a status word", async () => {
    const gone = new Ntag424(async () => {
      throw new Error("Tag was lost");
    });
    await expect(gone.selectApplication()).rejects.toMatchObject({ code: "connection" });
    const mute = new Ntag424(async () => new Uint8Array(1));
    await expect(mute.selectApplication()).rejects.toMatchObject({ code: "protocol" });
    const other = new Ntag424(async () => h("6A82"));
    await expect(other.selectApplication()).rejects.toMatchObject({ code: "unsupported" });
  });

  it("counts the commands that change the card, before sending them", async () => {
    const card = scripted([...AUTH, { expect: "908D00000802000000010000AA00", answer: "9100" }]);
    const ntag = new Ntag424(card.transceive, () => h(RND_A));
    await ntag.authenticate(0, ZERO_KEY);
    expect(ntag.changes).toBe(0);
    await ntag.writeData(2, 0, h("AA"));
    expect(ntag.changes).toBe(1);

    // A change whose answer never came counts too; a read does not.
    const lost = new Ntag424(async () => {
      throw new Error("Tag was lost");
    });
    await expect(lost.writeData(2, 0, h("AA"))).rejects.toMatchObject({ code: "connection" });
    expect(lost.changes).toBe(1);
    await expect(lost.getKeyVersion(0)).rejects.toMatchObject({ code: "connection" });
    expect(lost.changes).toBe(1);
  });

  it("keeps the UID GetCardUID gave, its MAC checked", async () => {
    const fake = new FakeNtag424();
    const ntag = new Ntag424(fake.transceive);
    await ntag.selectApplication();
    expect(ntag.knownUid).toBeNull();
    await ntag.authenticate(0, ZERO_KEY);
    await expect(ntag.getCardUid()).resolves.toEqual(fake.uid);
    expect(ntag.knownUid).toEqual(fake.uid);
  });

  it("checks the lengths of what the card answers", async () => {
    const card = new Ntag424(async () => h("01029100"));
    await expect(card.getKeyVersion(0)).rejects.toThrow(/length/);
    await expect(card.readData(2, 0, 3)).rejects.toThrow(/length/);
  });
});
