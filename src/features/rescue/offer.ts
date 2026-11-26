/**
 * The passkey's failures after which "Open with my 12 words" is offered: those another try would
 * not mend. The device or its password manager cannot use a
 * passkey, the app is no longer associated with its domain (its RP ID's host gone), no passkey is
 * found, or it failed without saying why. Never for a dismissed prompt, a passkey of another
 * account, or a failure the app's own steps mend (createdNotDerived, settingsTooNew, the network).
 */
export function rescueOffered(failure: string): boolean {
  return RESCUE_FAILURES.has(failure);
}

const RESCUE_FAILURES: ReadonlySet<string> = new Set([
  "unsupported",
  "prfUnsupported",
  "notAssociated",
  "noCredential",
  "failed"
]);
