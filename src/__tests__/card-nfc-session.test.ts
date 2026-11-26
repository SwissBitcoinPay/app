import { Platform } from "react-native";

import { encodeWalletSecret } from "@/lib/breez/secret";
import { cardIdOf, deriveCardRoot } from "@/lib/card/keys";
import { cancelCardSession, isSessionCancelled, withCardSession } from "@/lib/card/nfc-session";
import { programCard } from "@/lib/card/program";
import { readLog } from "@/lib/log/log";
import { NFC_CLOSE_WAIT_MS, readCard } from "@/lib/nfc/boltcard";
import { leavingForSystemUi, type SystemUiDeparture } from "@/lib/system-ui";

import type * as NfcFake from "../../jest/nfc-manager";
import { FakeNtag424 } from "../../jest/ntag424";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const MESSAGES = { alert: "Hold the card", success: "Card ready", failure: "Failed" };

beforeEach(() => nfc.resetNfcManager());

/** Lets the promises in flight go on (no timer: fake ones too) until `done` holds. */
async function until(done: () => boolean, never: string): Promise<void> {
  for (let tick = 0; !done(); tick++) {
    if (tick > 1000) throw new Error(never);
    await Promise.resolve();
  }
}

/** The requests the library got, in order. */
function requests(): string[] {
  return nfc.calls.filter((call) => call.startsWith("requestTechnology"));
}

/** Runs `run` as on iOS, whose sessions react-native-nfc-manager 4.2.0 ends once they closed. */
async function onIos(run: () => Promise<void>): Promise<void> {
  const os = Platform.OS;
  Platform.OS = "ios";
  nfc.closeLater();
  try {
    await run();
  } finally {
    Platform.OS = os;
  }
}

describe("a card held to the phone", () => {
  // Android hands the card over in a new intent, which pauses the app an instant: the app's lock
  // must not take that pause for its holder leaving (src/lib/system-ui.ts), and only it.
  it("is a card's pause on Android, the session and the point of sale's reading", async () => {
    const os = Platform.OS;
    Platform.OS = "android";
    try {
      nfc.holdCard(new FakeNtag424());
      await expect(withCardSession(MESSAGES, async () => leavingForSystemUi())).resolves.toBe(
        "pause"
      );
      expect(leavingForSystemUi()).toBeNull();

      let during: SystemUiDeparture = null;
      const request = jest
        .spyOn(nfc.default, "requestTechnology")
        .mockImplementationOnce(async () => {
          during = leavingForSystemUi();
          throw new Error("No tag in the field");
        });
      try {
        await expect(readCard({ alertMessage: "" }).lnurl).rejects.toThrow("No tag in the field");
      } finally {
        request.mockRestore();
      }
      expect(during).toBe("pause");
      expect(leavingForSystemUi()).toBeNull();
    } finally {
      Platform.OS = os;
    }
  });

  it("programs it over ISO-DEP, with the tag's UID, and ends the session", async () => {
    const fake = new FakeNtag424();
    nfc.holdCard(fake);

    const programmed = await withCardSession(MESSAGES, async ({ card, tagUid }) => {
      expect(tagUid).toEqual(fake.uid);
      return programCard(card, { root, relayHost: "relay.sattle.me", version: 1 });
    });

    expect(programmed.cardId).toBe(cardIdOf(root, fake.uid));
    expect(nfc.calls[0]).toBe("requestTechnology IsoDep Hold the card");
    expect(nfc.calls.at(-1)).toBe("cancelTechnologyRequest");
    expect(nfc.requestActive()).toBe(false);
  });

  it("shows the outcome in the iOS sheet as it closes", async () => {
    const os = Platform.OS;
    Platform.OS = "ios";
    try {
      nfc.holdCard(new FakeNtag424());
      await withCardSession(MESSAGES, async () => "done");
      expect(nfc.calls).toContain("setAlertMessageIOS Card ready");

      nfc.resetNfcManager();
      nfc.holdCard(new FakeNtag424());
      await expect(
        withCardSession(MESSAGES, async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
      expect(nfc.calls).toContain("invalidateSessionWithErrorIOS Failed");
      expect(nfc.requestActive()).toBe(false);
    } finally {
      Platform.OS = os;
    }
  });

  it("ends the session when the card leaves the field mid-way", async () => {
    const fake = new FakeNtag424();
    fake.interruptAt(3);
    nfc.holdCard(fake);

    await expect(
      withCardSession(MESSAGES, ({ card }) =>
        programCard(card, { root, relayHost: "relay.sattle.me", version: 1 })
      )
    ).rejects.toMatchObject({ code: "connection" });
    expect(nfc.requestActive()).toBe(false);
  });

  it("tells a closed sheet from a failure", async () => {
    nfc.cancelNextRequest();
    const error = await withCardSession(MESSAGES, async () => "never").catch((e: unknown) => e);
    expect(isSessionCancelled(error)).toBe(true);
    expect(isSessionCancelled(new Error("other"))).toBe(false);
    expect(nfc.requestActive()).toBe(false);
  });

  it("opens no session for a holder who left, nor sends a card held after a cancel anything", async () => {
    const fake = new FakeNtag424();
    nfc.holdCard(fake);
    const run = jest.fn(async () => "never");

    // Left before the session would open: nothing asked of NFC.
    const left = await withCardSession(MESSAGES, run, { stopped: () => true }).catch(
      (error: unknown) => error
    );
    expect(isSessionCancelled(left)).toBe(true);
    expect(nfc.calls).toEqual([]);

    // "Cancel" as the card came into the field: the session ends before any command.
    const getTag = nfc.default.getTag;
    jest.spyOn(nfc.default, "getTag").mockImplementationOnce(async () => {
      cancelCardSession();
      return getTag();
    });
    const cancelled = await withCardSession(MESSAGES, run).catch((error: unknown) => error);
    expect(isSessionCancelled(cancelled)).toBe(true);

    // Left while the phone waited for a card: the card held then is sent nothing either.
    nfc.resetNfcManager();
    nfc.waitForCard();
    let gone = false;
    const waiting = withCardSession(MESSAGES, run, { stopped: () => gone }).catch(
      (error: unknown) => error
    );
    await until(() => nfc.awaitingCard(), "The session never waited for a card");
    gone = true;
    const later = new FakeNtag424("04112233445566");
    nfc.holdCard(later);
    expect(isSessionCancelled(await waiting)).toBe(true);

    expect(run).not.toHaveBeenCalled();
    expect(fake.received).toHaveLength(0);
    expect(later.received).toHaveLength(0);
    expect(nfc.requestActive()).toBe(false);
  });

  it("ends on iOS once its sheet closed, an end asked meanwhile included", () =>
    onIos(async () => {
      nfc.holdCard(new FakeNtag424());
      let ended = false;
      // "Cancel" while the card is programmed: the session's own ends come while that one waits,
      // and the library refuses them at once.
      const cancelled = withCardSession(MESSAGES, async () => {
        cancelCardSession();
        throw new Error("Not connected");
      })
        .catch((error: unknown) => error)
        .finally(() => (ended = true));
      await until(() => nfc.calls.includes("invalidateSessionWithErrorIOS Failed"), "No sheet");
      await until(
        () => nfc.calls.filter((call) => call === "cancelTechnologyRequest").length > 1,
        "No end"
      );
      for (let tick = 0; tick < 100; tick++) await Promise.resolve();
      expect(nfc.sessionClosing()).toBe(true);
      expect(ended).toBe(false);

      nfc.closeSession();
      expect(isSessionCancelled(await cancelled)).toBe(true);

      // The next session opens once the last one closed: its request is not refused.
      nfc.holdCard(new FakeNtag424());
      const next = withCardSession(MESSAGES, async () => "done");
      await until(() => nfc.sessionClosing(), "The session never ended");
      nfc.closeSession();
      await expect(next).resolves.toBe("done");
      expect(requests()).toHaveLength(2);
    }));

  it("starts the point of sale's next reading on iOS once the last one's sheet closed", () =>
    onIos(async () => {
      nfc.holdCard(new FakeNtag424());
      // Cancelled as the card came (the invoice paid otherwise): the reading's own end comes while
      // that one waits.
      jest.spyOn(nfc.default, "getTag").mockImplementationOnce(async () => {
        read.cancel();
        return null;
      });
      const read = readCard({ alertMessage: "Hold the card" });
      await expect(read.lnurl).rejects.toThrow("Not a BoltCard");

      const next = readCard({ alertMessage: "Hold the card" });
      for (let tick = 0; tick < 100; tick++) await Promise.resolve();
      expect(requests()).toHaveLength(1);

      nfc.closeSession();
      await expect(next.lnurl).rejects.toThrow("Not a BoltCard");
      expect(requests()).toHaveLength(2);
      nfc.closeSession();
    }));

  it("goes on without a sheet iOS never says closed, after a while, said in the journal", () =>
    onIos(async () => {
      jest.useFakeTimers();
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        nfc.holdCard(new FakeNtag424());
        let ended = false;
        const session = withCardSession(MESSAGES, async () => "done").finally(() => (ended = true));
        await until(() => nfc.sessionClosing(), "The session never ended");

        await jest.advanceTimersByTimeAsync(NFC_CLOSE_WAIT_MS - 1);
        expect(ended).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        await expect(session).resolves.toBe("done");
        expect(readLog().entries.map(({ event }) => event)).toEqual([
          "An NFC session did not close in time"
        ]);
      } finally {
        jest.useRealTimers();
      }
    }));

  it("gives no UID for a tag whose identifier is not 7 bytes (Random ID)", async () => {
    const fake = new FakeNtag424("08f84941");
    nfc.holdCard(fake);
    await withCardSession(MESSAGES, async ({ tagUid }) => {
      expect(tagUid).toBeNull();
    });
  });
});
