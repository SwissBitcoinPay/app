import { Platform } from "react-native";

import { phoneRiskSignals } from "@/lib/device-integrity";
import { readLog } from "@/lib/log/log";

import { jailMonkeyState as jailMonkey } from "../../jest/jail-monkey";

/*
 * Signs of a modified system (src/lib/device-integrity.ts), as jail-monkey gives them on Android
 * (faked by jest/jail-monkey.ts).
 */

function failures(): number {
  return readLog().entries.filter((entry) => entry.event === "Reading the phone's integrity failed")
    .length;
}

const platform = Platform.OS;

beforeEach(() => {
  Platform.OS = "android";
  // A failure the app handles goes to its journal (read here), and to the console in development.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  Platform.OS = platform;
  jest.restoreAllMocks();
});

describe("phoneRiskSignals", () => {
  it("says none of a phone neither rooted nor hooked", async () => {
    expect(await phoneRiskSignals()).toEqual([]);
  });

  it("says root and hooks, each as jail-monkey reads them", async () => {
    jailMonkey.rooted = true;
    jailMonkey.hooked = true;
    expect(await phoneRiskSignals()).toEqual(["root", "hooks"]);
  });

  it("reads the phone once: its system does not change while the app runs", async () => {
    jailMonkey.rooted = true;
    expect(await phoneRiskSignals()).toEqual(["root"]);
    jailMonkey.rooted = false;
    expect(await phoneRiskSignals()).toEqual(["root"]);
    expect(jailMonkey.reads).toBe(1);
  });

  it("says none when jail-monkey fails, logs it, and reads again at the next call", async () => {
    jailMonkey.refusal = new Error("Not linked");
    await expect(phoneRiskSignals()).resolves.toEqual([]);
    expect(failures()).toBe(1);
    jailMonkey.refusal = null;
    jailMonkey.hooked = true;
    expect(await phoneRiskSignals()).toEqual(["hooks"]);
    expect(jailMonkey.reads).toBe(2);
  });

  it("asks nothing off Android: jail-monkey is not linked on iOS", async () => {
    Platform.OS = "ios";
    jailMonkey.rooted = true;
    expect(await phoneRiskSignals()).toEqual([]);
    expect(jailMonkey.reads).toBe(0);
  });
});
