import { MEMBER_NAME_MAX_LENGTH } from "@/config/team";
import { lightningAddressUrl } from "@/lib/lightning/lnurl";
import { parseOptionalImageRef, sameImageRef, type ImageRef } from "@/lib/media/image";

/**
 * Per relay, connection included: `waiting` when a screen waits for the answer (joining), else
 * `background`. Some relays take several seconds (see RELAY_TIMEOUT_MS of the settings backups).
 */
export const TEAM_TIMEOUT_MS = { waiting: 8000, background: 15000 } as const;

export function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** A member's name: filled, at most MEMBER_NAME_MAX_LENGTH characters. */
export function isName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MEMBER_NAME_MAX_LENGTH;
}

export function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** What a member's device takes payments with: the business's public details. */
export type TeamProfile = {
  businessName: string;
  /** LUD-16 address of the owner's wallet on the Breez LNURL server. */
  lightningAddress: string;
  /** ISO 4217: the currency the keypad counts in. */
  currency: string;
  /**
   * Whether the point of sale's invoices also offer an on-chain address (the owner's
   * `onchainPayments`); always true in an assistant's channel (owner.ts activeChannel).
   */
  onchain: boolean;
  /** The business's logo (the owner's `logo`, src/lib/media/image.ts), null for its initials. */
  logo: ImageRef | null;
};

export function parseTeamProfile(value: unknown): TeamProfile | null {
  if (value === null || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.businessName !== "string" ||
    p.businessName.trim() === "" ||
    p.businessName.length > 200 ||
    typeof p.lightningAddress !== "string" ||
    lightningAddressUrl(p.lightningAddress) === null ||
    typeof p.currency !== "string" ||
    !/^[A-Z]{3}$/.test(p.currency) ||
    typeof p.onchain !== "boolean"
  ) {
    return null;
  }
  const logo = parseOptionalImageRef(p.logo);
  if (logo === undefined) return null;
  return {
    businessName: p.businessName,
    lightningAddress: p.lightningAddress,
    currency: p.currency,
    onchain: p.onchain,
    logo
  };
}

export function sameTeamProfile(a: TeamProfile, b: TeamProfile): boolean {
  return (
    a.businessName === b.businessName &&
    a.lightningAddress === b.lightningAddress &&
    a.currency === b.currency &&
    a.onchain === b.onchain &&
    sameImageRef(a.logo, b.logo)
  );
}
