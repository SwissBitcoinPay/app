import "@/i18n";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import * as AccountSession from "@/features/account/session";
import {
  checkLegacyWallet,
  subscribeLegacyTransfers,
  transferLegacyWallet,
  type LegacyTransferOutcome
} from "@/features/migration/transfer";
import { useLegacyWalletNotice } from "@/features/migration/useLegacyWalletNotice";
import { noteLegacyWalletOwner } from "@/features/migration/wallet-owner";
import { LEGACY_KEYS } from "@/lib/legacy-v2/data";
import { legacyAccountKey, legacyWatchKey } from "@/lib/legacy-v2/wallet";
import { saveLegacyWatch } from "@/lib/legacy-v2/watch-store";

import { TEST_WALLET_ID } from "../../jest/account";
import { putLegacyValue } from "../../jest/react-native-keychain";

/*
 * "Wallet"'s notice of the v2 wallet still on the phone (useLegacyWalletNotice): what the
 * v2 service paid it since the migration, and "Move". The look and the transfer are
 * migration-transfer.test.ts's.
 */

jest.mock("../features/migration/transfer", () => ({
  checkLegacyWallet: jest.fn(),
  transferLegacyWallet: jest.fn(),
  transferTypedWords: jest.fn(),
  typedLegacyWords: jest.fn(),
  subscribeLegacyTransfers: jest.fn(() => () => undefined),
  resetLegacyWalletCheck: jest.fn()
}));

const WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";

function Notice({ enabled = true, open = async () => true }) {
  const notice: ReactNode = useLegacyWalletNotice({ enabled, currency: "CHF", openWallet: open });
  return <View testID="host">{notice}</View>;
}

beforeEach(() => {
  jest.mocked(checkLegacyWallet).mockResolvedValue({ status: "none" });
  jest.spyOn(AccountSession, "getAccountWalletId").mockReturnValue(TEST_WALLET_ID);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The words the v2 app left on this phone, for the account that migrated here (wallet-owner.ts). */
async function putOwnWords() {
  putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
  await noteLegacyWalletOwner(TEST_WALLET_ID);
}

/** What a device keeps once the words were typed on it (another phone, the web app). */
async function watchTypedWallet() {
  const xpub = legacyWatchKey(await legacyAccountKey(WORDS.split(" ")));
  await saveLegacyWatch({ xpub, from: { 0: 3, 1: 0 }, checkedAt: 0 });
}

describe("useLegacyWalletNotice", () => {
  it("shows nothing without a v2 wallet on the phone, and never looks then", async () => {
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("host")).toBeTruthy());
    expect(screen.queryByTestId("legacy-wallet-notice")).toBeNull();
    expect(checkLegacyWallet).not.toHaveBeenCalled();
  });

  it("never shows the v2 app's words to another account than the one that migrated", async () => {
    // Another account noted (the phone given away after "Log out", a new account on it).
    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
    await noteLegacyWalletOwner("03" + "ab".repeat(32));
    jest.mocked(checkLegacyWallet).mockResolvedValue({ status: "unchecked" });
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("host")).toBeTruthy());
    await act(async () => undefined);
    expect(screen.queryByTestId("legacy-wallet-notice")).toBeNull();
    expect(checkLegacyWallet).not.toHaveBeenCalled();
    expect(transferLegacyWallet).not.toHaveBeenCalled();
  });

  it("looks only once the wallet's data shows", async () => {
    await putOwnWords();
    await render(<Notice enabled={false} />);
    expect(checkLegacyWallet).not.toHaveBeenCalled();
  });

  it("offers to move what the v2 service paid since, then says it is on its way", async () => {
    await putOwnWords();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 120_000n, waitingSats: 0n });
    jest.mocked(transferLegacyWallet).mockResolvedValue({
      status: "sent",
      txid: "b".repeat(64),
      outputSats: 119_000n,
      feeSats: 1_000n,
      waitingSats: 0n
    });
    const open = jest.fn(async () => true);
    await render(<Notice open={open} />);

    await waitFor(() => expect(screen.getByTestId("legacy-wallet-funds")).toBeTruthy());
    expect(screen.getByTestId("legacy-wallet-funds")).toHaveTextContent(
      /0\.0012 BTC is left on your old account, to move here\./
    );
    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));

    await waitFor(() => expect(screen.getByTestId("migration-transfer-sent")).toBeTruthy());
    expect(open).toHaveBeenCalledTimes(1);
    expect(transferLegacyWallet).toHaveBeenCalledWith({
      title: "Open your old wallet",
      cancel: "Cancel"
    });
  });

  it("offers to look on a phone whose v2 wallet was never looked at with its words", async () => {
    await putOwnWords();
    jest.mocked(checkLegacyWallet).mockResolvedValue({ status: "unchecked" });
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-unchecked")).toBeTruthy());
    expect(screen.getByTestId("legacy-wallet-transfer")).toHaveTextContent(/Check and move/);
  });

  it("says money on its way to the v2 wallet, which nothing can move yet", async () => {
    await putOwnWords();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 0n, waitingSats: 5_000n });
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-incoming")).toBeTruthy());
    expect(screen.queryByTestId("legacy-wallet-transfer")).toBeNull();
  });

  it("never transfers when the account's wallet did not open", async () => {
    await putOwnWords();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 9_000n, waitingSats: 0n });
    await render(<Notice open={async () => false} />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-transfer")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-failed")).toBeTruthy());
    expect(transferLegacyWallet).not.toHaveBeenCalled();
  });

  it("leads to the words' screen for a wallet watched without its words on the device", async () => {
    await watchTypedWallet();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 30_000n, waitingSats: 0n });
    const push = jest.spyOn(router, "push").mockImplementation(() => undefined);
    const open = jest.fn(async () => true);
    await render(<Notice open={open} />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-funds")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));
    expect(push).toHaveBeenCalledWith("/migration/words");
    // Nothing asked of this device: its keychain holds no words.
    expect(transferLegacyWallet).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("offers the words' screen when the phone cannot open its words", async () => {
    await putOwnWords();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 30_000n, waitingSats: 0n });
    jest.mocked(transferLegacyWallet).mockResolvedValue({ status: "unreadable" });
    const push = jest.spyOn(router, "push").mockImplementation(() => undefined);
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-transfer")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-type-words")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-transfer-type-words"));
    expect(push).toHaveBeenCalledWith("/migration/words");
    push.mockRestore();
  });

  /** The listeners of transfers (the notice's and its transfer's), called as transfer.ts does. */
  function followTransfers() {
    const listeners: ((outcome: LegacyTransferOutcome) => void)[] = [];
    jest.mocked(subscribeLegacyTransfers).mockImplementation((listener) => {
      listeners.push(listener);
      return () => undefined;
    });
    return (outcome: LegacyTransferOutcome) =>
      act(async () => {
        for (const listener of listeners) listener(outcome);
      });
  }

  it("shows what the words typed moved, never its own older outcome, and looks again", async () => {
    await putOwnWords();
    const transferred = followTransfers();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValueOnce({ status: "funds", confirmedSats: 30_000n, waitingSats: 0n })
      .mockResolvedValue({ status: "none" });
    jest.mocked(transferLegacyWallet).mockResolvedValue({ status: "unreadable" });
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-transfer")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-unreadable")).toBeTruthy());

    // "Type my 12 words", over this screen, moved the money.
    await transferred({
      status: "sent",
      txid: "c".repeat(64),
      outputSats: 29_000n,
      feeSats: 1_000n,
      waitingSats: 0n
    });
    await waitFor(() => expect(screen.getByTestId("migration-transfer-sent")).toBeTruthy());
    expect(screen.queryByTestId("migration-transfer-unreadable")).toBeNull();
    await waitFor(() => expect(checkLegacyWallet).toHaveBeenCalledTimes(2));
  });

  it("keeps its own outcome when the words typed moved nothing", async () => {
    await putOwnWords();
    const transferred = followTransfers();
    jest
      .mocked(checkLegacyWallet)
      .mockResolvedValue({ status: "funds", confirmedSats: 30_000n, waitingSats: 0n });
    jest.mocked(transferLegacyWallet).mockResolvedValue({ status: "unreadable" });
    await render(<Notice />);
    await waitFor(() => expect(screen.getByTestId("legacy-wallet-transfer")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("legacy-wallet-transfer"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-unreadable")).toBeTruthy());

    await transferred({ status: "failed" });
    await transferred({ status: "unused" });
    expect(screen.getByTestId("migration-transfer-unreadable")).toBeTruthy();
  });
});
