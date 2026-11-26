import {
  currentPlan,
  forgetLegacyAccount,
  getMigration,
  legacyAccountCopy,
  legacySessionPending,
  readLegacyAccount,
  readLegacySessionOnce,
  legacySessionUnreachable,
  resetMigration,
  resumeMigration,
  retryLegacySession
} from "@/features/migration/flow";
import type { LegacyState } from "@/lib/legacy-v2/store";

import { acceptSession, hold, legacyV2 } from "../../jest/legacy-v2-server";

/*
 * The v2 account read as its card shows (src/app/migration/index.tsx): with
 * the v2 app's session, once per migration, without a tap; the migration resumed when the card is
 * drawn again; nothing of the v2 app's account taken once its owner said it is not theirs.
 */

const ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const REFRESH = "refresh-of-the-v2-app-0001";

function ownerState(): LegacyState {
  return {
    role: "owner",
    account: { id: ID, name: "Lakeside Bakery", currency: "CHF", onchain: true, email: null },
    tokens: { authToken: "expired-token-of-the-v2-app", refreshToken: REFRESH },
    hasWallet: false
  };
}

beforeEach(() => resetMigration());

describe("the read with the v2 app's session", () => {
  it("runs once, whoever asks while it runs or after", async () => {
    acceptSession(REFRESH);
    legacyV2.account = { id: ID, name: "Lakeside Bakery", mail: "carol@example.com" };
    const release = hold("/account");
    resumeMigration(ownerState());
    expect(legacySessionPending()).toBe(true);

    const first = readLegacySessionOnce();
    const second = readLegacySessionOnce();
    expect(second).toBe(first);
    release();
    await expect(first).resolves.toBe(true);
    await expect(readLegacySessionOnce()).resolves.toBe(true);

    expect(legacySessionPending()).toBe(false);
    expect(readLegacyAccount()).toMatchObject({ id: ID, email: "carol@example.com" });
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/refresh")).toHaveLength(1);
    expect(legacyV2.calls.filter(({ path }) => path === "/account")).toHaveLength(1);
  });

  it("ends, the password asked, when the session no longer serves", async () => {
    resumeMigration(ownerState());
    await expect(readLegacySessionOnce()).resolves.toBe(false);
    expect(legacySessionPending()).toBe(false);
    expect(readLegacyAccount()).toBeNull();
  });

  it("is read again on request when the v2 server did not answer, never when it refused", async () => {
    acceptSession(REFRESH);
    legacyV2.account = { id: ID, name: "Lakeside Bakery" };
    legacyV2.unreachable = true;
    resumeMigration(ownerState());
    await expect(readLegacySessionOnce()).resolves.toBe(false);
    expect(legacySessionUnreachable()).toBe(true);
    expect(legacySessionPending()).toBe(false);

    legacyV2.unreachable = false;
    retryLegacySession();
    expect(legacySessionUnreachable()).toBe(false);
    expect(legacySessionPending()).toBe(true);
    await expect(readLegacySessionOnce()).resolves.toBe(true);
    expect(readLegacyAccount()).toMatchObject({ id: ID });
  });

  it("offers no new read of a session the v2 server refused", async () => {
    resumeMigration(ownerState());
    await expect(readLegacySessionOnce()).resolves.toBe(false);
    expect(legacySessionUnreachable()).toBe(false);
    retryLegacySession();
    expect(legacySessionPending()).toBe(false);
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/refresh")).toHaveLength(1);
  });

  it("is never pending without a session", () => {
    resumeMigration({ ...ownerState(), tokens: null });
    expect(legacySessionPending()).toBe(false);
  });

  it("never reads with the session of an account its owner said is not theirs", async () => {
    acceptSession(REFRESH);
    resumeMigration(ownerState());
    forgetLegacyAccount();
    expect(legacySessionPending()).toBe(false);
    await expect(readLegacySessionOnce()).resolves.toBe(false);
    expect(legacyV2.calls).toEqual([]);
  });
});

describe("the migration of the card", () => {
  it("goes on when the card of the same state is drawn again, starts afresh for another", () => {
    const state = ownerState();
    const migration = resumeMigration(state);
    expect(resumeMigration(state)).toBe(migration);
    expect(getMigration()).toBe(migration);

    const other = resumeMigration({ ...state });
    expect(other).not.toBe(migration);
  });

  it("takes nothing more of the v2 app's copy once its owner said it is not theirs", () => {
    resumeMigration(ownerState());
    expect(legacyAccountCopy()).toMatchObject({ name: "Lakeside Bakery" });
    expect(currentPlan()?.patch).toMatchObject({ businessName: "Lakeside Bakery" });

    forgetLegacyAccount();
    expect(legacyAccountCopy()).toBeNull();
    // Another account's name never given to the new one: the v2 server's only, once read.
    expect(currentPlan()?.patch).not.toHaveProperty("businessName");
    expect(currentPlan()?.patch).not.toHaveProperty("displayCurrency");
  });
});
