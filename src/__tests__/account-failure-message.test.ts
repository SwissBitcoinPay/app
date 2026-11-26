import { Platform } from "react-native";

import { accountFailureMessage, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import i18n from "@/i18n";

const SYNCED =
  "No sattle.me passkey was offered on this device. Check that your passkeys are synced to this device.";
const BATTERY =
  "No sattle.me passkey was offered on this device. Check that your password manager is not restricted by the battery saver.";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("accountFailureMessage", () => {
  it.each(["ios", "web"] as const)("says nothing of a battery saver on %s", (os) => {
    jest.replaceProperty(Platform, "OS", os);
    expect(accountFailureMessage("noCredential", i18n.t)).toBe(SYNCED);
    expect(unlockFailureMessage("noCredential", i18n.t)).toBe(SYNCED);
  });

  it("names the battery saver on Android, at login and when unlocking", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(accountFailureMessage("noCredential", i18n.t)).toBe(BATTERY);
    expect(unlockFailureMessage("noCredential", i18n.t)).toBe(BATTERY);
  });

  it("keeps the other failures' messages on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(accountFailureMessage("failed", i18n.t)).toBe("Something went wrong. Try again.");
    expect(unlockFailureMessage("otherAccount", i18n.t)).toBe(
      i18n.t("navigation.lock.otherAccount")
    );
  });
});
