import type * as NotificationsFake from "../../jest/expo-notifications";

/** The app's modules loaded afresh, as when it starts: expo-notifications' own handler first. */
function startApp(load: () => void): typeof NotificationsFake {
  let notifications: typeof NotificationsFake | undefined;
  jest.isolateModules(() => {
    notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
    expect(notifications.notifications.handler).toBe(notifications.DEFAULT_NOTIFICATION_HANDLER);
    load();
  });
  return notifications!;
}

describe("notifications while the app shows", () => {
  // expo-notifications 58 shows them all (banner, sound, badge) until a handler says otherwise.
  it("shows none from the app's start, before the account's screens set their handler", () => {
    const notifications = startApp(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded afresh, see above
      require("@/app/_layout");
    });

    expect(notifications.notifications.handler).toBeNull();
  });

  it("shows none once asked, whatever handler came before", () => {
    const notifications = startApp(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded afresh, see above
      const { showNoNotificationInFront } = require("@/features/card/paid-notice") as {
        showNoNotificationInFront: () => void;
      };
      showNoNotificationInFront();
    });

    expect(notifications.notifications.handler).toBeNull();
  });
});
