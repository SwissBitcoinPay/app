import { beginMigration, readWithPassword, resetMigration } from "@/features/migration/flow";
import { legacyWordsNeeded, listedWalletBalance } from "@/features/migration/words-needed";
import { legacyAccountKey, legacyWatchKey } from "@/lib/legacy-v2/wallet";
import { loadLegacyWatch, saveLegacyWatch } from "@/lib/legacy-v2/watch-store";

import { acceptPassword, legacyV2 } from "../../jest/legacy-v2-server";

/*
 * Whether "Your account is up to date" asks for the v2 wallet's words (words-needed.ts): a wallet
 * the v2 app created, listed by the v2 account, holding more than dust by the v2 server's
 * `xpub-balance`. Over the fake v2 server (jest/legacy-v2-server.ts).
 */

/** BIP-84's "Account 0 root" of "abandon … about", as the v2 app gave it to the v2 server. */
const ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";

/** A migration whose v2 account, read with the password, lists `verified` as its destinations. */
async function migrationListing(verified: unknown[] | undefined) {
  legacyV2.account = {
    id: "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
    ...(verified ? { verified_addresses: verified } : {})
  };
  acceptPassword("carol@example.com", "the-right-word");
  beginMigration({ role: "owner", account: null, tokens: null, hasWallet: false });
  await expect(readWithPassword("carol@example.com", "the-right-word")).resolves.toEqual({
    ok: true
  });
}

const local = (address: string) => ({ address, walletConfig: { type: "local", zpub: address } });

afterEach(() => resetMigration());

describe("legacyWordsNeeded", () => {
  it("asks nothing without a v2 account read, nor of an account without a wallet of the v2 app", async () => {
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });

    // "Forgot your password": the migration goes on without the v2 account.
    beginMigration({ role: "owner", account: null, tokens: null, hasWallet: false });
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });

    await migrationListing([
      { address: "carol@wallet.example", walletConfig: { type: "local" } },
      { address: ZPUB, walletConfig: { type: "ledger" } }
    ]);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });
    // An answer without the list says nothing either.
    await migrationListing(undefined);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });
    expect(legacyV2.calls.some(({ path }) => path === "/v1/accounts/xpub-balance")).toBe(false);
  });

  it("asks nothing for an empty wallet, nor for dust, and watches it for what comes later", async () => {
    await migrationListing([local(ZPUB)]);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });
    legacyV2.balances.set(ZPUB, { confirmed_sat: 700, unconfirmed_sat: 0, complete: true });
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });

    // Asked as the v2 app asks it: anonymous, no session.
    const asked = legacyV2.calls.filter(({ path }) => path === "/v1/accounts/xpub-balance");
    expect(asked).toHaveLength(2);
    expect(asked.every(({ authorization }) => authorization === null)).toBe(true);
    // "Wallet" looks at it later, from its first address.
    const xpub = legacyWatchKey(await legacyAccountKey(ABANDON.split(" ")));
    expect((await loadLegacyWatch()).watch).toEqual({ xpub, from: { 0: 0, 1: 0 }, checkedAt: 0 });
  });

  it("asks the words of a wallet holding money, its amount confirmed and on its way", async () => {
    const other = legacyWatchKey(await legacyAccountKey(OTHER.split(" ")));
    await migrationListing([local(ZPUB), local(other)]);
    legacyV2.balances.set(ZPUB, { confirmed_sat: 40_000, unconfirmed_sat: 2_000, complete: true });
    legacyV2.balances.set(other, { confirmed_sat: 5_000, unconfirmed_sat: -5_000, complete: true });
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "funds", sats: 42_000n });
    // The last wallet listed is the one watched: the one the v2 service pays.
    expect((await loadLegacyWatch()).watch?.xpub).toBe(other);
  });

  it("reads a wallet proved twice once, never taking it for one without its key", async () => {
    const other = legacyWatchKey(await legacyAccountKey(OTHER.split(" ")));
    await migrationListing([local(other), local(ZPUB), local(other)]);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "none" });
    // The last listed is watched, though listed first too.
    expect((await loadLegacyWatch()).watch?.xpub).toBe(other);
  });

  it("watches no earlier wallet in place of a last one listed without its key", async () => {
    await migrationListing([
      local(ZPUB),
      { address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", walletConfig: { type: "local" } }
    ]);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "unknown" });
    expect((await loadLegacyWatch()).watch).toBeNull();
  });

  it("asks the words when the balance cannot be proven, never taking it for empty", async () => {
    await migrationListing([local(ZPUB)]);
    legacyV2.balanceDown = true;
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "unknown" });

    legacyV2.balanceDown = false;
    legacyV2.balances.set(ZPUB, { confirmed_sat: 0, unconfirmed_sat: 0, complete: false });
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "unknown" });

    await migrationListing([
      { address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", walletConfig: { type: "local" } }
    ]);
    await expect(legacyWordsNeeded()).resolves.toEqual({ status: "unknown" });
  });

  it("never replaces the wallet this device watches already", async () => {
    const other = legacyWatchKey(await legacyAccountKey(OTHER.split(" ")));
    await saveLegacyWatch({ xpub: other, from: { 0: 4, 1: 1 }, checkedAt: 1_800_000_000_000 });
    await migrationListing([local(ZPUB)]);
    await legacyWordsNeeded();
    expect((await loadLegacyWatch()).watch).toEqual({
      xpub: other,
      from: { 0: 4, 1: 1 },
      checkedAt: 1_800_000_000_000
    });
  });
});

describe("listedWalletBalance", () => {
  it("says what the one wallet of the v2 app holds, confirmed and on its way", async () => {
    await expect(listedWalletBalance()).resolves.toBeNull();
    await migrationListing([local(ZPUB)]);
    legacyV2.balances.set(ZPUB, { confirmed_sat: 40_000, unconfirmed_sat: 2_000, complete: true });
    await expect(listedWalletBalance()).resolves.toBe(42_000n);
    // Proved twice: still one wallet.
    await migrationListing([local(ZPUB), local(ZPUB)]);
    await expect(listedWalletBalance()).resolves.toBe(42_000n);
    // Read anonymously; nothing watched for it.
    const asked = legacyV2.calls.filter(({ path }) => path === "/v1/accounts/xpub-balance");
    expect(asked.every(({ authorization }) => authorization === null)).toBe(true);
    await expect(loadLegacyWatch()).resolves.toEqual({ watch: null, newer: false });
  });

  it("says no amount it could not prove the phone's: none, several, or one not read", async () => {
    await migrationListing(undefined);
    await expect(listedWalletBalance()).resolves.toBeNull();
    await migrationListing([{ address: "carol@wallet.example", walletConfig: { type: "local" } }]);
    await expect(listedWalletBalance()).resolves.toBeNull();

    const other = legacyWatchKey(await legacyAccountKey(OTHER.split(" ")));
    await migrationListing([local(ZPUB), local(other)]);
    legacyV2.balances.set(ZPUB, { confirmed_sat: 40_000, unconfirmed_sat: 0, complete: true });
    await expect(listedWalletBalance()).resolves.toBeNull();

    await migrationListing([local(ZPUB)]);
    legacyV2.balances.set(ZPUB, { confirmed_sat: 40_000, unconfirmed_sat: 0, complete: false });
    await expect(listedWalletBalance()).resolves.toBeNull();
    legacyV2.balanceDown = true;
    await expect(listedWalletBalance()).resolves.toBeNull();
  });
});
