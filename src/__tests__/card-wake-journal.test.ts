import { wipeDevice } from "@/features/settings/device-wipe";
import {
  CARD_WAKES_DIR_NAME,
  MAX_WAKES,
  MAX_WAKE_STEPS,
  NewerCardWakesError,
  addCardWakeStep,
  beginCardWake,
  clearCardWakes,
  endCardWake,
  loadCardWakes,
  type CardWakeEntry
} from "@/lib/card/wake-journal";
import * as web from "@/lib/card/wake-journal.web";

import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * The card wakes' journal (src/lib/card/wake-journal.ts): what the card socket's task writes down,
 * step by step, for the team to read on a real phone ("Wake journal").
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const JOURNAL_URI = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_WAKES_DIR_NAME}/journal.json`;

const STARTED = Date.UTC(2026, 9, 15, 13, 10);

function wake(n: number): Omit<CardWakeEntry, "steps" | "tapCheck" | "endedAtMs"> {
  return {
    id: n.toString(16).padStart(16, "0"),
    startedAt: STARTED + n,
    receivedAt: STARTED + n - 350,
    jsAgeMs: 820,
    appState: "background",
    accountOpen: false
  };
}

beforeEach(() => {
  fileSystem.resetFileSystem();
});

describe("the card wakes' journal", () => {
  it("writes a wake down as it goes, under its irreversible name", async () => {
    const first = wake(1);
    await beginCardWake(first);
    // Written at once: a wake Android stops shows where.
    expect(await loadCardWakes()).toEqual([
      { ...first, steps: [], tapCheck: null, endedAtMs: null }
    ]);
    await addCardWakeStep(first.id, { name: "taken", atMs: 40, detail: null });
    await addCardWakeStep(first.id, { name: "paying", atMs: 2_100, detail: "automatic" });
    await addCardWakeStep(first.id, { name: "sent", atMs: 4_800, detail: "pending" });
    await endCardWake(first.id, 5_300, "cardRoot");
    expect(await loadCardWakes()).toEqual([
      {
        ...first,
        steps: [
          { name: "taken", atMs: 40, detail: null },
          { name: "paying", atMs: 2_100, detail: "automatic" },
          { name: "sent", atMs: 4_800, detail: "pending" }
        ],
        tapCheck: "cardRoot",
        endedAtMs: 5_300
      }
    ]);
    expect(CARD_WAKES_DIR_NAME).toBe("card-wakes");
    expect(JSON.parse(fileSystem.files.get(JOURNAL_URI)!)).toMatchObject({ version: 3 });
    expect([...fileSystem.files.keys()]).toEqual([JOURNAL_URI]);
  });

  it("keeps steps in order, written without waiting for each other", async () => {
    const first = wake(1);
    void beginCardWake(first);
    const steps = ["taken", "waiting", "checking", "ready"].map((name, index) =>
      addCardWakeStep(first.id, { name, atMs: index * 100, detail: null })
    );
    await Promise.all(steps);
    const [entry] = await loadCardWakes();
    expect(entry!.steps.map((step) => step.name)).toEqual([
      "taken",
      "waiting",
      "checking",
      "ready"
    ]);
  });

  it("keeps the last MAX_WAKES wakes, newest first, and MAX_WAKE_STEPS steps each", async () => {
    for (let n = 1; n <= MAX_WAKES + 3; n += 1) await beginCardWake(wake(n));
    const wakes = await loadCardWakes();
    expect(wakes).toHaveLength(MAX_WAKES);
    expect(wakes[0]!.id).toBe(wake(MAX_WAKES + 3).id);
    expect(wakes.at(-1)!.id).toBe(wake(4).id);

    const last = wake(MAX_WAKES + 3).id;
    for (let i = 0; i < MAX_WAKE_STEPS + 5; i += 1) {
      await addCardWakeStep(last, { name: "checking", atMs: i, detail: null });
    }
    await addCardWakeStep(last, { name: "sent", atMs: 9_000, detail: "completed" });
    const { steps } = (await loadCardWakes())[0]!;
    expect(steps).toHaveLength(MAX_WAKE_STEPS);
    // The steps in between give way, never how the wake ended.
    expect(steps.at(-2)).toEqual({ name: "checking", atMs: MAX_WAKE_STEPS - 2, detail: null });
    expect(steps.at(-1)).toEqual({ name: "sent", atMs: 9_000, detail: "completed" });
  });

  it("refuses what it could not read back: free text, an amount, a bad time", async () => {
    await expect(beginCardWake({ ...wake(1), id: "not-hex" })).rejects.toThrow();
    await expect(beginCardWake({ ...wake(1), appState: "back ground" })).rejects.toThrow();
    await expect(beginCardWake({ ...wake(1), startedAt: -1 })).rejects.toThrow();
    await expect(beginCardWake({ ...wake(1), receivedAt: -1 })).rejects.toThrow();
    await expect(
      beginCardWake({ ...wake(1), receivedAt: null as unknown as number })
    ).rejects.toThrow();
    await beginCardWake(wake(1));
    const id = wake(1).id;
    await expect(
      addCardWakeStep(id, { name: "sent", atMs: 10, detail: "12 500 sats" })
    ).rejects.toThrow();
    await expect(
      addCardWakeStep(id, { name: "Lakeside Bakery", atMs: 10, detail: null })
    ).rejects.toThrow();
    await expect(addCardWakeStep(id, { name: "sent", atMs: -1, detail: null })).rejects.toThrow();
    await expect(endCardWake(id, -5, null)).rejects.toThrow();
    // A wake the journal no longer has: nothing to change.
    await addCardWakeStep("ffffffffffffffff", { name: "taken", atMs: 1, detail: null });
    expect((await loadCardWakes())[0]).toMatchObject({ steps: [], endedAtMs: null });
  });

  it("reads untrusted storage: a damaged file is empty, an entry out of shape left out", async () => {
    fileSystem.files.set(JOURNAL_URI, "{not json");
    expect(await loadCardWakes()).toEqual([]);
    await beginCardWake(wake(1));
    const stored = JSON.parse(fileSystem.files.get(JOURNAL_URI)!) as {
      version: number;
      wakes: unknown[];
    };
    stored.wakes.push(
      { ...stored.wakes[0]!, id: "0000000000000002", steps: [{ name: "x y", atMs: 1 }] },
      { ...stored.wakes[0]!, id: "0000000000000003", tapCheck: "seed" },
      { ...stored.wakes[0]!, id: "0000000000000004", amountSats: 12_500 },
      "a wake"
    );
    fileSystem.files.set(JOURNAL_URI, JSON.stringify(stored));
    // The extra field is dropped; the others are refused whole.
    expect((await loadCardWakes()).map((entry) => entry.id)).toEqual([
      "0000000000000004",
      wake(1).id
    ]);
    expect(await loadCardWakes()).not.toContainEqual(
      expect.objectContaining({ amountSats: expect.anything() })
    );
  });

  it("keeps when the card socket received each wake's packet, and nothing of a push", async () => {
    await beginCardWake(wake(2));
    const [entry] = await loadCardWakes();
    expect(entry).toMatchObject({ startedAt: STARTED + 2, receivedAt: STARTED - 348 });
    // A push's fields of format 2, written by a hand or an older app: dropped when read.
    const stored = JSON.parse(fileSystem.files.get(JOURNAL_URI)!) as {
      version: number;
      wakes: Record<string, unknown>[];
    };
    stored.wakes[0] = { ...stored.wakes[0], via: "data", sentAt: STARTED, priority: 1 };
    fileSystem.files.set(JOURNAL_URI, JSON.stringify(stored));
    const [read] = await loadCardWakes();
    expect(Object.keys(read!).sort()).toEqual(
      [
        "id",
        "startedAt",
        "receivedAt",
        "jsAgeMs",
        "appState",
        "accountOpen",
        "steps",
        "tapCheck",
        "endedAtMs"
      ].sort()
    );
  });

  it.each([1, 2])(
    "no longer reads a journal of format %i (with push wakes): written over as format 3",
    async (version) => {
      // As older apps wrote it: a push's fields.
      const entry = {
        ...wake(1),
        via: "data",
        sentAt: STARTED,
        originalPriority: 1,
        priority: 1,
        steps: [],
        tapCheck: null,
        endedAtMs: 4_000
      };
      fileSystem.files.set(JOURNAL_URI, JSON.stringify({ version, wakes: [entry] }));
      expect(await loadCardWakes()).toEqual([]);
      await beginCardWake(wake(2));
      const stored = JSON.parse(fileSystem.files.get(JOURNAL_URI)!) as {
        version: number;
        wakes: { id: string }[];
      };
      expect(stored.version).toBe(3);
      expect(stored.wakes.map(({ id }) => id)).toEqual([wake(2).id]);
    }
  );

  it("never writes over a newer app's journal (staging gets OTA rollbacks)", async () => {
    const newer = JSON.stringify({ version: 4, wakes: [], more: true });

    fileSystem.files.set(JOURNAL_URI, newer);
    await expect(loadCardWakes()).rejects.toBeInstanceOf(NewerCardWakesError);
    await expect(beginCardWake(wake(1))).rejects.toBeInstanceOf(NewerCardWakesError);
    await expect(clearCardWakes()).rejects.toBeInstanceOf(NewerCardWakesError);
    expect(fileSystem.files.get(JOURNAL_URI)).toBe(newer);
  });

  it('is emptied by "Clear the journal" and by "Log out"', async () => {
    await beginCardWake(wake(1));
    await clearCardWakes();
    expect(await loadCardWakes()).toEqual([]);
    await beginCardWake(wake(2));
    await wipeDevice();
    expect([...fileSystem.files.keys()].some((uri) => uri.includes("/card-wakes/"))).toBe(false);
    expect(await loadCardWakes()).toEqual([]);
  });
});

describe("the card wakes' journal on the web", () => {
  it("keeps nothing: the web app has no card wakes", async () => {
    await web.beginCardWake(wake(1));
    await web.addCardWakeStep(wake(1).id, { name: "taken", atMs: 1, detail: null });
    await web.endCardWake(wake(1).id, 2, null);
    expect(await web.loadCardWakes()).toEqual([]);
    expect(web.CARD_WAKES_DIR_NAME).toBe(CARD_WAKES_DIR_NAME);
    expect(fileSystem.files.size).toBe(0);
  });
});
