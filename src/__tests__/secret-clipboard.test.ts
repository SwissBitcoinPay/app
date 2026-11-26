import * as Clipboard from "expo-clipboard";

import { SECRET_CLIPBOARD_LIFETIME_MS, copySecret } from "@/lib/secret-clipboard";

/*
 * The one way to copy a secret (src/lib/secret-clipboard.ts): sensitive on Android, gone from the
 * iPhone's pasteboard after 2 minutes, Universal Clipboard allowed.
 */

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

afterEach(() => {
  jest.useRealTimers();
  jest.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true);
});

describe("copySecret", () => {
  it("copies the secret marked sensitive, removed by iOS 2 minutes later", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-20T10:00:00.000Z") });

    await expect(copySecret("sk_secret")).resolves.toBe(true);

    expect(SECRET_CLIPBOARD_LIFETIME_MS).toBe(120_000);
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("sk_secret", {
      android: { isSensitive: true },
      ios: { expiresAt: new Date("2026-11-20T10:02:00.000Z") }
    });
  });

  it("leaves Universal Clipboard to iOS: never local only", async () => {
    await copySecret("sk_secret");
    const options = jest.mocked(Clipboard.setStringAsync).mock.calls[0]![1];
    expect(options?.ios).not.toHaveProperty("localOnly");
  });

  it("says what the clipboard answered: not copied, or refused", async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await expect(copySecret("sk_secret")).resolves.toBe(false);

    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("permission denied"));
    await expect(copySecret("sk_secret")).rejects.toThrow("permission denied");
  });
});
