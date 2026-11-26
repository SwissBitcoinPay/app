import "@/i18n";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { closeAccount } from "@/features/account/session";
import { resetMigration } from "@/features/migration/flow";
import {
  markLegacyHistoryPending,
  readLegacyHistory,
  resetHistoryImport,
  startLegacyHistoryImport
} from "@/features/migration/history-import";
import {
  LEGACY_HISTORY_DEADLINE,
  LegacyHistorySetting
} from "@/features/migration/LegacyHistorySetting";

import { openMerchantAccount } from "../../jest/account";
import { acceptPassword, acceptSession, legacyV2 } from "../../jest/legacy-v2-server";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Swiss Bitcoin Pay history" of "Settings" (LegacyHistorySetting.tsx): the copy of the v2 history
 * started again with the v2 password, while the relays say it did not finish and the v2 service
 * runs.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const SALE = {
  id: "id-0001",
  status: "settled",
  tag: "invoice-tpos",
  amount_sat: 25_000,
  created_at: 1_790_000_000,
  paid_at: 1_790_000_060,
  title: "Lakeside Bakery",
  description: "Croissants",
  input: { unit: "CHF", amount: 12.5 }
};

beforeEach(async () => {
  relays.resetRelays();
  resetHistoryImport();
  resetMigration();
  await openMerchantAccount({ displayCurrency: "CHF" });
  // The v2 account the copy reads its name of (history.ts, noteOf).
  legacyV2.account = { id: "0192a3b4-c5d6-7e8f-9a0b-0000000000aa", name: "Lakeside Bakery" };
});

afterEach(() => closeAccount());

describe("LegacyHistorySetting", () => {
  it("copies the history with the v2 password, then says how much", async () => {
    legacyV2.payments = [SALE];
    acceptPassword("carol@example.com", "the-right-word");
    await markLegacyHistoryPending();
    await render(<LegacyHistorySetting now={() => LEGACY_HISTORY_DEADLINE - 1} />);
    await waitFor(() => expect(screen.getByTestId("legacy-history-open")).toBeTruthy());
    expect(screen.getByTestId("legacy-history-setting")).toHaveTextContent(
      /Possible until 31\sDecember\s2026/
    );

    await fireEvent.press(screen.getByTestId("legacy-history-open"));
    await fireEvent.changeText(screen.getByTestId("legacy-history-email"), "carol@example.com");
    await fireEvent.changeText(screen.getByTestId("legacy-history-password"), "wrong");
    await fireEvent.press(screen.getByTestId("legacy-history-submit"));
    await waitFor(() => expect(screen.getByText("Wrong email or password")).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId("legacy-history-password"), "the-right-word");
    await fireEvent.press(screen.getByTestId("legacy-history-submit"));
    await waitFor(() => expect(screen.getByTestId("migration-history-done")).toBeTruthy());
    expect(screen.getByTestId("migration-history-done")).toHaveTextContent(/1 movement, shown/);
    // The button gone: the history is copied.
    expect(screen.queryByTestId("legacy-history-open")).toBeNull();
    expect(legacyV2.loggedOut).toHaveLength(1);
  });

  it("shows nothing for an account the migration did not create", async () => {
    await render(<LegacyHistorySetting now={() => LEGACY_HISTORY_DEADLINE - 1} />);
    // Its read answered (shared with this one: one read at a time), no copy said started.
    await act(async () => {
      await expect(readLegacyHistory()).resolves.toMatchObject({ done: false, pending: false });
    });
    expect(screen.queryByTestId("legacy-history-setting")).toBeNull();
  });

  it("shows nothing once the history is copied, nor after the v2 service's end", async () => {
    legacyV2.payments = [SALE];
    acceptSession("refresh-of-the-owner-0001", "auth-of-the-owner-00000001");
    await startLegacyHistoryImport({
      authToken: "auth-of-the-owner-00000001",
      refreshToken: "refresh-of-the-owner-0001"
    });
    resetHistoryImport();
    const { unmount } = await render(
      <LegacyHistorySetting now={() => LEGACY_HISTORY_DEADLINE - 1} />
    );
    await waitFor(() => expect(relays.calls.length).toBeGreaterThan(0));
    expect(screen.queryByTestId("legacy-history-setting")).toBeNull();
    await unmount();

    relays.resetRelays();
    resetHistoryImport();
    await render(<LegacyHistorySetting now={() => LEGACY_HISTORY_DEADLINE + 1} />);
    expect(screen.queryByTestId("legacy-history-setting")).toBeNull();
    expect(relays.calls).toHaveLength(0);
  });

  it("stops asking the password before the v2 server locks the account", async () => {
    acceptPassword("carol@example.com", "the-right-word");
    await markLegacyHistoryPending();
    await render(<LegacyHistorySetting now={() => LEGACY_HISTORY_DEADLINE - 1} />);
    await waitFor(() => expect(screen.getByTestId("legacy-history-open")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("legacy-history-open"));
    for (let attempt = 0; attempt < 2; attempt++) {
      await fireEvent.changeText(screen.getByTestId("legacy-history-email"), "carol@example.com");
      await fireEvent.changeText(screen.getByTestId("legacy-history-password"), "wrong");
      await fireEvent.press(screen.getByTestId("legacy-history-submit"));
      await waitFor(() =>
        expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(
          attempt + 1
        )
      );
    }
    // The panel, opened again, no longer asks.
    await fireEvent.press(screen.getByTestId("legacy-history-open"));
    await waitFor(() => expect(screen.getByTestId("legacy-history-stopped")).toBeTruthy());
  });
});
