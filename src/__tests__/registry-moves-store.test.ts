import { loadRegistryMoves, saveRegistryMoves } from "@/lib/registry/moves-store";
import * as webStore from "@/lib/registry/moves-store.web";
import type { RegistryMoves } from "@/lib/registry/moves";

import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * Where the changes of relays still to copy are kept (moves-store.ts, moves-store.web.ts): the
 * names installed apps read their records under, written out here so that a rename fails.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

const MOVES_DIR = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/registry-moves";

const record: RegistryMoves = {
  version: 2,
  moves: [{ left: ["wss://relay.example.com"], at: 1790000000, copied: null, records: false }]
};

describe("the record of the relays' changes", () => {
  it("keeps one file per account in the documents directory, removed once empty", async () => {
    await saveRegistryMoves(WALLET.toUpperCase(), record);
    expect([...fileSystem.files.keys()]).toEqual([`${MOVES_DIR}/${WALLET}.json`]);
    await expect(loadRegistryMoves(WALLET)).resolves.toEqual(record);

    await saveRegistryMoves(WALLET, { version: 2, moves: [] });
    expect([...fileSystem.files.keys()]).toEqual([]);
  });

  it("reads a record of version 1, whose changes copied their other records once, at the change", async () => {
    fileSystem.files.set(
      `${MOVES_DIR}/${WALLET}.json`,
      JSON.stringify({
        version: 1,
        moves: [{ left: ["wss://relay.example.com"], at: 1790000000, copied: 1790003600 }]
      })
    );
    await expect(loadRegistryMoves(WALLET)).resolves.toEqual({
      version: 2,
      moves: [
        { left: ["wss://relay.example.com"], at: 1790000000, copied: 1790003600, records: true }
      ]
    });
    // Version 2 says it, and a change without it is no change of this format: none read.
    fileSystem.files.set(
      `${MOVES_DIR}/${WALLET}.json`,
      JSON.stringify({
        version: 2,
        moves: [{ left: ["wss://relay.example.com"], at: 1, copied: null }]
      })
    );
    await expect(loadRegistryMoves(WALLET)).resolves.toEqual({ version: 2, moves: [] });
  });

  it("never writes over a newer app's record", async () => {
    fileSystem.files.set(`${MOVES_DIR}/${WALLET}.json`, JSON.stringify({ version: 3 }));
    await expect(loadRegistryMoves(WALLET)).rejects.toThrow(
      "A newer app wrote the relays' changes"
    );
  });

  describe("on the web", () => {
    // The browser's localStorage, which Jest does not have.
    const entries = new Map<string, string>();

    beforeAll(() => {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: (key: string) => entries.get(key) ?? null,
          setItem: (key: string, value: string) => void entries.set(key, String(value)),
          removeItem: (key: string) => void entries.delete(key)
        }
      });
    });

    afterAll(() => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it("keeps one entry per account in the browser, removed once empty", async () => {
      await webStore.saveRegistryMoves(WALLET.toUpperCase(), record);
      expect([...entries.keys()]).toEqual([`registry-moves/${WALLET}`]);
      await expect(webStore.loadRegistryMoves(WALLET)).resolves.toEqual(record);

      await webStore.saveRegistryMoves(WALLET, { version: 2, moves: [] });
      expect([...entries.keys()]).toEqual([]);
    });

    it("never writes over a newer app's record", async () => {
      entries.set(`registry-moves/${WALLET}`, JSON.stringify({ version: 3 }));
      await expect(webStore.loadRegistryMoves(WALLET)).rejects.toBeInstanceOf(
        webStore.NewerMovesError
      );
    });
  });
});
