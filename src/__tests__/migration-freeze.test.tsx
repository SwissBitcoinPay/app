import "@/i18n";

import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import { closeAccount } from "@/features/account/session";
import { resetMigration } from "@/features/migration/flow";
import {
  forgetFreezeOwed,
  freezeLegacyAccount,
  isFreezeOwed,
  noteFreezeOwed
} from "@/features/migration/freeze";
import { FreezeStatus } from "@/features/migration/FreezeStatus";
import { useHistoryImport } from "@/features/migration/history-import";
import { holdLegacySession } from "@/features/migration/legacy-session";
import { useLegacyFreeze } from "@/features/migration/useLegacyFreeze";
import { LegacyFreezeSetting } from "@/features/migration/LegacyFreezeSetting";
import { LEGACY_HISTORY_DEADLINE } from "@/features/migration/LegacyHistorySetting";
import { publishTerminalProfile } from "@/features/terminal/profile-cache";
import { wipeDevice } from "@/features/settings/device-wipe";
import {
  LEGACY_FREEZE_OWED_KEY,
  LEGACY_FREEZE_OWED_VERSION,
  MAX_FREEZES_OWED,
  NewerFreezeOwedError,
  freezeOwedText,
  parseFreezeOwed
} from "@/lib/legacy-v2/freeze-owed-format";
import * as server from "@/lib/legacy-v2/server";
import { TERMINAL_PROFILE_VERSION } from "@/lib/terminal/model";

import { TEST_WALLET_ID, openMerchantAccount, testBackupKey } from "../../jest/account";
import { acceptPassword, acceptSession, hold, legacyV2 } from "../../jest/legacy-v2-server";

/*
 * The v2 account's freeze (freeze.ts) outside "Your account is up to date": its answers, the
 * device's list of the freezes still owed (freeze-owed-format.ts, IRREVERSIBLE: its key's name and
 * format locked here), and "Old Swiss Bitcoin Pay account" of "Settings"
 * (LegacyFreezeSetting.tsx), which asks it again with the v2 password.
 */

const LIGHTNING_ADDRESS = "sattleme02c6047f94@breez.tips";
const REFRESH = "refresh-of-the-owner-0001";
const AUTH = "auth-of-the-owner-00000001";

/** This device prepared as the account's point of sale (activate.ts), its Lightning address. */
function preparePointOfSale() {
  publishTerminalProfile({
    version: TERMINAL_PROFILE_VERSION,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: LIGHTNING_ADDRESS,
    businessName: "Lakeside Bakery",
    currency: "CHF"
  });
}

beforeEach(async () => {
  resetMigration();
  await openMerchantAccount({ displayCurrency: "CHF" });
  preparePointOfSale();
});

afterEach(async () => {
  closeAccount();
  publishTerminalProfile(null);
  await forgetFreezeOwed(TEST_WALLET_ID);
});

describe("the list of the v2 accounts owed their freeze", () => {
  it("keeps its name and its format", () => {
    expect(LEGACY_FREEZE_OWED_KEY).toBe("legacy-v2-freeze-owed");
    expect(LEGACY_FREEZE_OWED_VERSION).toBe(1);
    expect(JSON.parse(freezeOwedText([TEST_WALLET_ID]))).toEqual({
      version: 1,
      wallets: [TEST_WALLET_ID]
    });
  });

  it("leaves out what is out of shape, keeps the newest, and refuses a newer app's", () => {
    expect(parseFreezeOwed(null)).toEqual([]);
    expect(parseFreezeOwed("{")).toEqual([]);
    expect(parseFreezeOwed(JSON.stringify({ version: 0, wallets: [TEST_WALLET_ID] }))).toEqual([]);
    expect(
      parseFreezeOwed(JSON.stringify({ version: 1, wallets: [TEST_WALLET_ID, "zz", 3, "ABCDEF"] }))
    ).toEqual([TEST_WALLET_ID]);
    const many = Array.from({ length: MAX_FREEZES_OWED + 4 }, (_, n) =>
      n.toString(16).padStart(4, "0")
    );
    expect(parseFreezeOwed(freezeOwedText(many))).toEqual(many.slice(-MAX_FREEZES_OWED));
    expect(() => parseFreezeOwed(JSON.stringify({ version: 2 }))).toThrow(NewerFreezeOwedError);
  });

  it("is forgotten once the v2 server froze the account, and kept while it could not", async () => {
    acceptSession(REFRESH, AUTH);
    await noteFreezeOwed(TEST_WALLET_ID);
    legacyV2.migrateStatus = 503;
    const failed = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(failed.freeze).toEqual({ phase: "failed", retry: true });
    await expect(isFreezeOwed(TEST_WALLET_ID)).resolves.toBe(true);

    legacyV2.migrateStatus = null;
    const done = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(done.freeze).toEqual({
      phase: "done",
      lightningAddress: LIGHTNING_ADDRESS,
      payout: "sent"
    });
    expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS);
    await expect(isFreezeOwed(TEST_WALLET_ID)).resolves.toBe(false);
  });

  it('is wiped by "Log out"', async () => {
    await noteFreezeOwed(TEST_WALLET_ID);
    await wipeDevice();
    await expect(SecureStore.getItemAsync(LEGACY_FREEZE_OWED_KEY)).resolves.toBeNull();
  });
});

describe("the freeze's answers", () => {
  it("tries again an address the v2 server could not check, never taking it as final", async () => {
    acceptSession(REFRESH, AUTH);
    legacyV2.migrateStatus = 400;
    const outcome = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(outcome.freeze).toEqual({ phase: "failed", retry: true });
    expect(outcome.session).not.toBeNull();
  });

  it("says an account the v2 service suspended for good", async () => {
    acceptSession(REFRESH, AUTH);
    legacyV2.migrateStatus = 403;
    const outcome = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(outcome.freeze).toEqual({ phase: "rejected" });
  });

  it("renews an expired token once, and keeps a session the network only failed to renew", async () => {
    jest.restoreAllMocks();
    acceptSession(REFRESH);
    const renewed = await freezeLegacyAccount({ authToken: "expired", refreshToken: REFRESH });
    expect(renewed.freeze.phase).toBe("done");
    expect(renewed.session?.authToken).not.toBe("expired");

    // The renewal itself cut by the network: the session still serves, kept to try again and close.
    legacyV2.migratedTo = null;
    jest
      .spyOn(server, "refreshLegacySession")
      .mockRejectedValueOnce(new server.LegacyServerError("network", "offline"));
    const offline = await freezeLegacyAccount({ authToken: "expired", refreshToken: REFRESH });
    expect(offline.freeze).toEqual({ phase: "failed", retry: true });
    expect(offline.session).toEqual({ authToken: "expired", refreshToken: REFRESH });
  });

  it("gives up a session the v2 server ended, with nothing left to close", async () => {
    const ended = await freezeLegacyAccount({ authToken: "expired", refreshToken: "gone" });
    expect(ended).toEqual({ freeze: { phase: "failed", retry: false }, session: null });
  });
});

describe("the payout the migration's call made", () => {
  it("says the sats left only when the v2 server says so, else by 0:00 UTC at the latest", async () => {
    acceptSession(REFRESH, AUTH);
    legacyV2.migratePayout = "pending";
    const pending = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(pending.freeze).toEqual({
      phase: "done",
      lightningAddress: LIGHTNING_ADDRESS,
      payout: "pending"
    });
    await render(<FreezeStatus freeze={pending.freeze} onRetry={() => undefined} />);
    expect(screen.getByTestId("migration-freeze-done")).toHaveTextContent(
      /The funds will be transferred to your new sattle\.me wallet by 0:00\sUTC at the latest\./
    );
    expect(screen.getByTestId("migration-freeze-done")).not.toHaveTextContent(/breez\.tips/);
  });

  it("says there was nothing to transfer, never that sats left", async () => {
    acceptSession(REFRESH, AUTH);
    legacyV2.migratePayout = "none";
    const none = await freezeLegacyAccount({ authToken: AUTH, refreshToken: REFRESH });
    expect(none.freeze).toEqual({
      phase: "done",
      lightningAddress: LIGHTNING_ADDRESS,
      payout: "none"
    });
    await render(<FreezeStatus freeze={none.freeze} onRetry={() => undefined} />);
    expect(screen.getByTestId("migration-freeze-done")).toHaveTextContent(
      /No balance to transfer\./
    );
    expect(screen.getByTestId("migration-freeze-done")).not.toHaveTextContent(/transferred/);
  });

  it("never takes an answer without `payout` for sats sent", async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ migrated: true })
        }) as Response
    );
    await expect(
      server.migrateLegacyAccount({ authToken: AUTH, refreshToken: REFRESH }, LIGHTNING_ADDRESS, {
        fetchImpl
      })
    ).resolves.toEqual({ payout: "pending" });
  });
});

describe("useLegacyFreeze", () => {
  it("says the history's copy waiting, then running from the freeze's end to the copy's, never a gap between", async () => {
    acceptSession(REFRESH, AUTH);
    // The v2 account the copy reads its name of first (history.ts, noteOf).
    legacyV2.account = { id: "0192a3b4-c5d6-7e8f-9a0b-0000000000aa", name: "Lakeside Bakery" };
    holdLegacySession({ authToken: AUTH, refreshToken: REFRESH });
    const releaseFreeze = hold("/v1/accounts/migrate");
    const releaseHistory = hold("/api/records/v1/apipayments");
    // Every render: what "Your account is up to date" reads to offer anything (done.tsx).
    const seen: { freeze: string; copy: string; status: string }[] = [];
    await renderHook(() => {
      const { freeze, historyCopy } = useLegacyFreeze();
      const status = useHistoryImport().phase;
      seen.push({ freeze: freeze.phase, copy: historyCopy, status });
    });
    await waitFor(() =>
      expect(legacyV2.calls.some(({ path }) => path === "/v1/accounts/migrate")).toBe(true)
    );
    expect(seen.at(-1)).toEqual({ freeze: "running", copy: "waiting", status: "idle" });

    await act(async () => releaseFreeze());
    await waitFor(() => expect(seen.at(-1)?.freeze).toBe("done"));
    await waitFor(() =>
      expect(legacyV2.calls.some(({ path }) => path === "/api/records/v1/apipayments")).toBe(true)
    );
    expect(seen.at(-1)?.copy).toBe("running");

    await act(async () => releaseHistory());
    await waitFor(() => expect(seen.at(-1)?.copy).toBe("ended"));
    expect(seen.at(-1)?.status).toBe("done");
    // From the freeze's end, the copy said running until it said done: never both quiet before.
    const afterFreeze = seen.slice(seen.findIndex(({ freeze }) => freeze === "done"));
    expect(afterFreeze[0]?.copy).toBe("running");
    const quiet = afterFreeze.findIndex(
      ({ copy, status }) => copy !== "running" && status !== "running"
    );
    expect(afterFreeze[quiet]?.status).toBe("done");
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });
});

describe("LegacyFreezeSetting", () => {
  it("freezes the v2 account with the v2 password, then closes the session", async () => {
    await noteFreezeOwed(TEST_WALLET_ID);
    acceptPassword("carol@example.com", "the-right-word");
    await render(<LegacyFreezeSetting now={() => LEGACY_HISTORY_DEADLINE - 1} />);
    await waitFor(() => expect(screen.getByTestId("legacy-freeze-open")).toBeTruthy());
    expect(screen.getByTestId("legacy-freeze-setting")).toHaveTextContent(
      /it still accepts payments/
    );

    await fireEvent.press(screen.getByTestId("legacy-freeze-open"));
    await fireEvent.changeText(screen.getByTestId("legacy-freeze-email"), "carol@example.com");
    await fireEvent.changeText(screen.getByTestId("legacy-freeze-password"), "the-right-word");
    await fireEvent.press(screen.getByTestId("legacy-freeze-submit"));
    await waitFor(() => expect(screen.getByTestId("migration-freeze-done")).toBeTruthy());
    expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS);
    expect(screen.queryByTestId("legacy-freeze-open")).toBeNull();
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
    await expect(isFreezeOwed(TEST_WALLET_ID)).resolves.toBe(false);
  });

  it("shows nothing for an account whose freeze is not owed, nor after the v2 service's end", async () => {
    const { unmount } = await render(
      <LegacyFreezeSetting now={() => LEGACY_HISTORY_DEADLINE - 1} />
    );
    await expect(isFreezeOwed(TEST_WALLET_ID)).resolves.toBe(false);
    expect(screen.queryByTestId("legacy-freeze-setting")).toBeNull();
    await unmount();

    await noteFreezeOwed(TEST_WALLET_ID);
    await render(<LegacyFreezeSetting now={() => LEGACY_HISTORY_DEADLINE + 1} />);
    await expect(isFreezeOwed(TEST_WALLET_ID)).resolves.toBe(true);
    expect(screen.queryByTestId("legacy-freeze-setting")).toBeNull();
  });
});
