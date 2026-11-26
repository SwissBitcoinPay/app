import { wipeDevice } from "@/features/settings/device-wipe";
import { readLog } from "@/lib/log/log";
import { createMtPelerinApi } from "@/lib/mtpelerin/api";
import { createMtpSession, MtpSessionLostError } from "@/lib/mtpelerin/session";
import {
  MTPELERIN_SESSION_KEY,
  NewerMtpSessionError,
  parseMtpSession
} from "@/lib/mtpelerin/session-format";
import { changeMtpSession, forgetMtpSession, loadMtpSession } from "@/lib/mtpelerin/session-store";
import { mtpSessionStore } from "@/lib/mtpelerin/session-sync";
import { mtPelerinTransport } from "@/lib/mtpelerin/transport";

import { TEST_WALLET_ID } from "../../jest/account";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import { REFRESH_ROTATION_MS } from "../../jest/mtpelerin-fake/server";

const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const PHONE = "+41791234567";
const OTHER_WALLET = `03${"ab".repeat(32)}`;

const api = () => createMtPelerinApi(mtPelerinTransport("production"));
/** This device's copy only: the relays' are shared-session.test.ts's. */
const OWNER = { walletId: TEST_WALLET_ID, environment: "production" } as const;
const store = () => mtpSessionStore(OWNER, null);

/** Keeps `refreshToken` as a login would. */
const saveToken = (walletId: string, refreshToken: string) =>
  changeMtpSession({ walletId, environment: "production" }, (record) => ({
    ...record,
    refreshToken,
    sessionAt: 1,
    unshared: true
  }));

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The stored record, as it is written. */
const stored = () => parseMtpSession(secureStore.items.get(MTPELERIN_SESSION_KEY) ?? null);

/** Logs in by SMS on the fake, as the flow does. */
async function login() {
  const mtp = api();
  const device = await mtp.addPhoneDevice(PHONE, "3.0.0");
  await mtp.sendSms(device.id);
  const session = createMtpSession(mtp, store(), null);
  await session.login(device.id, fake.mtPelerin().smsCode);
  return session;
}

describe("a Mt Pelerin session", () => {
  it("keeps its refresh token under a name of its own, never its access token", async () => {
    // IRREVERSIBLE: installed apps keep their session there.
    expect(MTPELERIN_SESSION_KEY).toBe("mtpelerin-session");
    await login();
    const record = stored();
    expect(record).toEqual({
      walletId: TEST_WALLET_ID,
      environment: "production",
      refreshToken: expect.stringMatching(/^fake\./),
      sessionAt: expect.any(Number),
      paidValidations: [],
      // No relay to share it with here.
      unshared: true
    });
    const raw = secureStore.items.get(MTPELERIN_SESSION_KEY) ?? "";
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
    // The access token (1 hour) stays in memory: no other token in the record.
    expect(raw.match(/fake\./g)).toHaveLength(1);
  });

  it("refreshes on `401 token expired`, then the call once more", async () => {
    const session = await login();
    const server = fake.mtPelerin();
    server.seedProfile(PHONE);
    server.expireAccessTokens();
    const person = await session.authed((token) => api().findPerson(token));
    expect(person?.phone).toBe(PHONE);
    const paths = server.requests.map(({ method, path }) => `${method} ${path}`);
    expect(paths.slice(-3)).toEqual([
      "GET /persons/findOne",
      "POST /tokens/refresh",
      "GET /persons/findOne"
    ]);
  });

  it("shares one refresh among the calls that meet an expired token together", async () => {
    const session = await login();
    const server = fake.mtPelerin();
    server.expireAccessTokens();
    await Promise.all([
      session.authed((token) => api().findPerson(token)),
      session.authed((token) => api().listAccounts(token, {}))
    ]);
    expect(server.requests.filter(({ path }) => path === "/tokens/refresh")).toHaveLength(1);
  });

  it("keeps the same refresh token within 30 days, the new pair past them (rotation)", async () => {
    const server = fake.mtPelerin();
    let now = Date.now();
    server.now = () => now;
    const session = await login();
    const first = stored();
    server.expireAccessTokens();
    await session.authed((token) => api().findPerson(token));
    expect(stored()).toEqual(first);
    // Past its 30 days: "a new pair, and the token you just sent is permanently consumed".
    now += REFRESH_ROTATION_MS + 1;
    server.expireAccessTokens();
    await session.authed((token) => api().findPerson(token));
    const rotated = stored();
    expect(rotated !== null && rotated !== "newer" && rotated.refreshToken).not.toBe(
      first !== null && first !== "newer" && first.refreshToken
    );
    // The new one works from a new app start.
    const again = createMtpSession(
      api(),
      store(),
      rotated !== null && rotated !== "newer" ? rotated.refreshToken : null
    );
    await expect(again.authed((token) => api().findPerson(token))).resolves.toBeNull();
  });

  it("is lost once its refresh token is refused: the flow logs in by SMS again", async () => {
    const session = await login();
    fake.mtPelerin().revokeSessions();
    await expect(session.authed((token) => api().findPerson(token))).rejects.toBeInstanceOf(
      MtpSessionLostError
    );
    expect(session.open()).toBe(false);
    expect(stored()).toMatchObject({ refreshToken: null });
  });

  it("loses nothing offline: the token stays for the next attempt", async () => {
    const session = await login();
    const server = fake.mtPelerin();
    server.expireAccessTokens();
    server.offline = true;
    await expect(session.authed((token) => api().findPerson(token))).rejects.toMatchObject({
      code: "offline"
    });
    expect(session.open()).toBe(true);
    expect(stored()).toMatchObject({ refreshToken: expect.stringMatching(/^fake\./) });
    server.offline = false;
    await expect(session.authed((token) => api().findPerson(token))).resolves.toBeNull();
  });

  it('forgets its tokens at "Log out of Mt Pelerin", the paid invoices kept', async () => {
    const session = await login();
    await store().recordPaid({ accountId: "a1", paidAt: 1_790_000_000_000 });
    await session.logout();
    expect(stored()).toMatchObject({
      walletId: TEST_WALLET_ID,
      refreshToken: null,
      paidValidations: [{ accountId: "a1", paidAt: 1_790_000_000_000 }]
    });
    await expect(session.authed((token) => api().findPerson(token))).rejects.toBeInstanceOf(
      MtpSessionLostError
    );
  });

  it("never logs a token nor the SMS code", async () => {
    const mtp = api();
    const device = await mtp.addPhoneDevice(PHONE, "3.0.0");
    await mtp.sendSms(device.id);
    const session = createMtpSession(mtp, store(), null);
    await expect(session.login(device.id, "000000")).rejects.toMatchObject({
      code: "unauthorized"
    });
    await session.login(device.id, fake.mtPelerin().smsCode);
    const token = (stored() as { refreshToken: string }).refreshToken;
    fake.mtPelerin().offline = true;
    fake.mtPelerin().expireAccessTokens();
    await session.authed((access) => api().findPerson(access)).catch(() => undefined);
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    fake.mtPelerin().offline = false;
    await session.logout();
    const journal = JSON.stringify(readLog());
    expect(journal).toContain("Saving the Mt Pelerin session failed");
    expect(journal).not.toContain(token);
    expect(journal).not.toContain(fake.mtPelerin().smsCode);
    expect(journal).not.toContain("fake.");
    expect(journal).not.toContain(PHONE);
  });
});

describe("the device's record of Mt Pelerin", () => {
  it("is the open account's only", async () => {
    await saveToken(TEST_WALLET_ID, "fake.token-of-the-account");
    expect((await loadMtpSession(OWNER)).refreshToken).toBe("fake.token-of-the-account");
    // Wallet ids compared without their case.
    expect(
      (await loadMtpSession({ ...OWNER, walletId: TEST_WALLET_ID.toUpperCase() })).refreshToken
    ).toBe("fake.token-of-the-account");
    expect(await loadMtpSession({ ...OWNER, walletId: OTHER_WALLET })).toEqual({
      walletId: OTHER_WALLET,
      environment: "production",
      refreshToken: null,
      sessionAt: 0,
      paidValidations: [],
      unshared: false
    });
    // Another Mt Pelerin's is not this one's: its token is never sent there.
    expect((await loadMtpSession({ ...OWNER, environment: "test" })).refreshToken).toBeNull();
    // Another account's session replaces it: one at a time.
    await saveToken(OTHER_WALLET, "fake.token-of-another");
    expect((await loadMtpSession(OWNER)).refreshToken).toBeNull();
  });

  it("is never written over by an older app", async () => {
    const newer = JSON.stringify({ version: 2, walletId: TEST_WALLET_ID, session: {} });
    secureStore.items.set(MTPELERIN_SESSION_KEY, newer);
    expect((await loadMtpSession(OWNER)).refreshToken).toBeNull();
    await expect(saveToken(TEST_WALLET_ID, "fake.token")).rejects.toBeInstanceOf(
      NewerMtpSessionError
    );
    expect(secureStore.items.get(MTPELERIN_SESSION_KEY)).toBe(newer);
  });

  it("refuses what it did not write", () => {
    expect(parseMtpSession("not json")).toBeNull();
    expect(parseMtpSession(JSON.stringify({ version: 1, walletId: "x" }))).toBeNull();
    expect(
      parseMtpSession(
        JSON.stringify({
          version: 1,
          walletId: TEST_WALLET_ID,
          refreshToken: null,
          sessionAt: 0,
          paidValidations: [{ accountId: "a b", paidAt: 1 }],
          unshared: false
        })
      )
    ).toBeNull();
    const valid = {
      version: 1,
      walletId: TEST_WALLET_ID,
      environment: "production",
      refreshToken: "fake.token",
      sessionAt: 1_790_000_000,
      paidValidations: [],
      unshared: false
    };
    expect(parseMtpSession(JSON.stringify(valid))).toMatchObject({ refreshToken: "fake.token" });
    for (const damaged of [
      { ...valid, sessionAt: -1 },
      { ...valid, sessionAt: 1.5 },
      { ...valid, unshared: "no" },
      { ...valid, refreshToken: "" },
      { ...valid, environment: "staging" }
    ]) {
      expect(parseMtpSession(JSON.stringify(damaged))).toBeNull();
    }
  });

  it('goes with "Log out" (wipeDevice)', async () => {
    await saveToken(TEST_WALLET_ID, "fake.token");
    expect(secureStore.items.has(MTPELERIN_SESSION_KEY)).toBe(true);
    await wipeDevice();
    expect(secureStore.items.has(MTPELERIN_SESSION_KEY)).toBe(false);
  });

  it("goes whole with forgetMtpSession", async () => {
    await saveToken(TEST_WALLET_ID, "fake.token");
    await forgetMtpSession();
    expect(secureStore.items.has(MTPELERIN_SESSION_KEY)).toBe(false);
  });
});
