/*
 * The metadata the open account's Lightning address served before its description changed
 * (MerchantSettings.formerAddressMetadata, src/features/terminal/address-description.ts), kept here
 * by the account's session (src/features/account/session.ts) whenever its settings change: the
 * checks of declared invoices read it (checkDeclaredInvoice, src/lib/registry/registry.ts) wherever
 * they run, without loading the account's session. Empty without an open account: a payer's page,
 * an employee's device, the point of sale in till mode.
 */

let former: readonly string[] = [];

/** The open account's former metadata of its address, empty without an open account. */
export function openAccountFormerMetadata(): readonly string[] {
  return former;
}

/** For the session only: the open account's list, or empty once it closes. */
export function setOpenAccountFormerMetadata(list: readonly string[]): void {
  former = list;
}
