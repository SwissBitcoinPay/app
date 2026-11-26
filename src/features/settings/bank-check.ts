import { isValidIban } from "@/lib/iban";

export type BankCheck =
  | { status: "valid" }
  /** The IBAN is refused: the field says to check its digits. */
  | { status: "ibanRefused" };

/**
 * The check of the details before the bank account typed goes to Mt Pelerin: the IBAN's own
 * checksum (ISO 13616, src/lib/iban.ts).
 */
export async function verifyBankAccount(iban: string): Promise<BankCheck> {
  return isValidIban(iban) ? { status: "valid" } : { status: "ibanRefused" };
}
