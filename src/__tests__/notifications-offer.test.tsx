import "@/i18n";

import { hexToBytes } from "@noble/hashes/utils.js";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { closeAccount, getAccountWalletId } from "@/features/account/session";
import { recordCardState, resetCardStates, withCardAccess } from "@/features/card/states";
import { NotificationsOffer } from "@/features/notification-offer/NotificationsOffer";
import * as webOffer from "@/features/notification-offer/offer.web";
import { NOTIFICATIONS_OFFER_KEY } from "@/features/notification-offer/offer-format";
import { nextCheckStart } from "@/features/recovery-check/policy";
import { RECOVERY_REMINDERS_CHANNEL } from "@/features/recovery-check/reminders";
import { wipeDevice } from "@/features/settings/device-wipe";
import { cardIdOf } from "@/lib/card/keys";
import { nowUnix } from "@/lib/clock";

import { openCardHolderAccount, openMerchantAccount, openTestAccount } from "../../jest/account";
import { deletedElsewhere } from "../../jest/card-states";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * "Stay informed" (NotificationsOffer.tsx): the phone's
 * notifications asked once, after the app's setup, with what they are for.
 */

const notifications =
  jest.requireMock<typeof NotificationsFake>("expo-notifications").notifications;
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const TITLE = "Stay informed";
const CARDS_LINE = "Your cards, Card payments waiting for your approval.";

/** A card in service of the open account, as its pairing records it; resolves with its id. */
async function activeCard(uid = "04a1b2c3d4e5f6"): Promise<string> {
  return withCardAccess(async (access) => {
    const cardId = cardIdOf(access.root, hexToBytes(uid));
    await recordCardState(access, {
      cardId,
      uid,
      keyVersion: 1,
      status: "active",
      relayHost: "relay.sattle.me",
      lastCounter: 0,
      depositedThrough: 0,
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5,
      suspended: false,
      name: "",
      look: null,
      issuer: null,
      settingsAt: Date.now(),
      walletGeneration: 1
    });
    return cardId;
  });
}

/**
 * The offer for an account opened already: the clock faked from now on (the panel's animations,
 * driven by `settle`; the account's opening needs the real one).
 */
async function show(open = true) {
  jest.useFakeTimers();
  return render(<NotificationsOffer open={open} />);
}

/** Whatever was started runs to its end: the reads, the system's prompt, the panel's animations. */
async function settle() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2_000);
  });
}

/** The offer shown, once its reads are done. */
async function offered(): Promise<boolean> {
  await settle();
  return screen.queryByText(TITLE) !== null;
}

async function press(testID: string) {
  await fireEvent.press(screen.getByTestId(testID));
  await settle();
}

beforeEach(async () => {
  closeAccount();
  // Each test its own account's cards: the session's states are the module's.
  resetCardStates();
  await openMerchantAccount();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('"Stay informed"', () => {
  it('is offered once the app is set up, and asks the system on "Allow notifications"', async () => {
    await show();

    expect(await offered()).toBe(true);
    expect(
      screen.getByText(
        "Allow notifications: sattle.me tells you what matters, even with the app closed."
      )
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Your 12 words, A yearly reminder to check them, for your security.")
    ).toBeTruthy();
    // No card: nothing of the cards to tell.
    expect(screen.queryByLabelText(CARDS_LINE)).toBeNull();
    expect(notifications.requests).toBe(0);

    await press("notifications-offer-allow");

    expect(screen.queryByText(TITLE)).toBeNull();
    expect(notifications.requests).toBe(1);
    expect(notifications.permission).toBe("granted");
    expect(secureStore.items.has(NOTIFICATIONS_OFFER_KEY)).toBe(true);
  });

  describe("the cards' line, for an account with a card only", () => {
    it("tells the card payments of an account with a card", async () => {
      await activeCard();
      await show();
      expect(await offered()).toBe(true);
      expect(screen.getByLabelText(CARDS_LINE)).toBeTruthy();
    });

    it("tells them from what the device keeps, before this session read the cards", async () => {
      await activeCard();
      // The app opened again: the session knows nothing yet of the cards, the device keeps one.
      resetCardStates();
      await show();
      expect(await offered()).toBe(true);
      expect(screen.getByLabelText(CARDS_LINE)).toBeTruthy();
    });

    it("tells them as soon as the session reads a card, the panel open", async () => {
      await show();
      expect(await offered()).toBe(true);
      expect(screen.queryByLabelText(CARDS_LINE)).toBeNull();

      // The account's sync reads a card added elsewhere (states.ts).
      await act(async () => {
        const added = activeCard();
        await jest.advanceTimersByTimeAsync(2_000);
        await added;
      });

      expect(screen.getByLabelText(CARDS_LINE)).toBeTruthy();
    });

    it("leaves them out for a card deleted", async () => {
      const cardId = await activeCard();
      await deletedElsewhere(getAccountWalletId()!, cardId);
      await show();
      expect(await offered()).toBe(true);
      expect(screen.queryByLabelText(CARDS_LINE)).toBeNull();
    });
  });

  it("plans the check's notifications as soon as they are allowed", async () => {
    closeAccount();
    const verifiedAt = nowUnix() - 86_400;
    await openMerchantAccount({
      recoveryCheck: { verifiedAt, dueSince: null, aboveThresholdAt: verifiedAt }
    });
    await show();
    expect(await offered()).toBe(true);
    expect(notifications.scheduled).toEqual([]);

    await press("notifications-offer-allow");

    expect(notifications.scheduled.map((request) => request.identifier)).toEqual([
      "recovery-check-start"
    ]);
    expect(notifications.scheduled[0]!.trigger).toMatchObject({
      date: nextCheckStart(verifiedAt) * 1000
    });
  });

  it("plans nothing when the system's prompt is refused", async () => {
    closeAccount();
    await openMerchantAccount({ recoveryCheck: { verifiedAt: nowUnix(), dueSince: null } });
    notifications.answer = "denied";
    await show();
    expect(await offered()).toBe(true);

    await press("notifications-offer-allow");

    expect(screen.queryByText(TITLE)).toBeNull();
    expect(notifications.permission).toBe("denied");
    expect(notifications.scheduled).toEqual([]);
  });

  it('is never offered again on this device once answered, "Not now" too', async () => {
    const first = await show();
    expect(await offered()).toBe(true);

    await press("notifications-offer-later");

    expect(screen.queryByText(TITLE)).toBeNull();
    // The system was not asked: it may still be, as a card is paired.
    expect(notifications.requests).toBe(0);
    expect(notifications.permission).toBe("undetermined");
    await first.unmount();

    // The app opened again.
    await show();
    expect(await offered()).toBe(false);
  });

  it('is offered again after "Log out", which forgets everything of the device', async () => {
    const first = await show();
    expect(await offered()).toBe(true);
    await press("notifications-offer-later");
    expect(secureStore.items.has(NOTIFICATIONS_OFFER_KEY)).toBe(true);
    await first.unmount();

    await wipeDevice();

    expect(secureStore.items.has(NOTIFICATIONS_OFFER_KEY)).toBe(false);
    await show();
    expect(await offered()).toBe(true);
  });

  it("is not offered where notifications are allowed already, or the system can no longer ask", async () => {
    notifications.permission = "granted";
    const allowed = await show();
    expect(await offered()).toBe(false);
    await allowed.unmount();

    notifications.permission = "denied";
    notifications.canAskAgain = false;
    await show();
    expect(await offered()).toBe(false);
    // Nothing answered: the system's permission says it at each opening.
    expect(secureStore.items.has(NOTIFICATIONS_OFFER_KEY)).toBe(false);
  });

  it("waits for a sign-up done", async () => {
    closeAccount();
    await openTestAccount({ signUp: "usage", usage: null });
    await show();
    expect(await offered()).toBe(false);
  });

  it("waits for the app unlocked: never in till mode", async () => {
    const shown = await show(false);
    expect(await offered()).toBe(false);

    await shown.rerender(<NotificationsOffer open />);
    expect(await offered()).toBe(true);

    // Locked again (till mode): hidden, offered again once unlocked.
    await shown.rerender(<NotificationsOffer open={false} />);
    expect(await offered()).toBe(false);
    await shown.rerender(<NotificationsOffer open />);
    expect(await offered()).toBe(true);
  });

  it("is offered to a card holder too", async () => {
    closeAccount();
    await openCardHolderAccount();
    await show();
    expect(await offered()).toBe(true);
  });

  it("creates the check's channel first on Android, where the system asks only once one exists", async () => {
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await show();
      expect(await offered()).toBe(true);
      await press("notifications-offer-allow");
      expect(notifications.requests).toBe(1);
    } finally {
      android.restore();
    }

    expect(notifications.channels.get(RECOVERY_REMINDERS_CHANNEL)).toMatchObject({
      name: "Recovery phrase"
    });
  });

  it("is never offered on the web, which plans no notification", async () => {
    expect(await webOffer.shouldOfferNotifications()).toBe(false);
  });

  it("keeps its storage key: installed apps would offer it again", () => {
    expect(NOTIFICATIONS_OFFER_KEY).toBe("notifications-offer");
  });
});
