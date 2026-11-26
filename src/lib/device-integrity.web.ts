/* Same API as device-integrity.ts. The web app keeps no card's passes: nothing to read. */

export type PhoneRiskSignal = "root" | "hooks";

export function phoneRiskSignals(): Promise<PhoneRiskSignal[]> {
  return Promise.resolve([]);
}

export function forgetPhoneRiskSignals(): void {}
