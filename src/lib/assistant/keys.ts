import { deriveKey, nostrKeys } from "@/lib/nostr/keys";
import { formatSeatKey, parseSeatKey, type IntegrationAccess } from "@/lib/integrations/keys";
import {
  deriveMemberKeys,
  memberTakerKey,
  type InvoiceKeys,
  type MemberKeys
} from "@/lib/team/keys";

/*
 * The secret key of an assistant: the owner gives it to an MCP server (sattleme/mcp-server, local
 * or hosted), which makes the business's invoices of "New invoice" with it: numbered in the
 * owner's series, with their payment link and
 * their PDF. The key (assistantSecretKey of src/lib/team/keys.ts, from the team's root) never
 * spends anything nor reads the wallet, the seed, the balance, nor the invoices made in the app.
 *
 * What it gives is an employee's keys (deriveMemberKeys: its channel, the records of its payment
 * links, which the owner finalizes as an employee's, src/features/payment-link/owner-finals.ts, and
 * its mark, memberTakerKey), from a secret of its own, never a member's, and the keys of its own
 * invoices (their author, their NIP-44 key and the key of their `d` tags), which the owner derives
 * too to list them with its own. Whoever holds it can make invoices that pay the merchant, read the
 * invoices of this assistant (its clients' names and addresses) and take numbers: the owner removes
 * the assistant when it leaks; its invoices written before stay readable to the key's holder.
 *
 * Never change the salt, the `info` strings nor the prefix once released: every assistant's
 * channel, invoices and marks derive from them (`assistant-keys.test.ts` locks them).
 */

/** Domain of the keys an assistant's key gives besides an employee's. */
export const ASSISTANT_SALT = "sattle.me/assistant";

const KEY_LENGTH = 32;

/** What an assistant's key gives. */
export type AssistantKeys = {
  /**
   * An employee's keys, from the assistant's own secret: its channel (signed by the team), the
   * author and keys of the records of its payment links.
   */
  member: MemberKeys;
  /** Marks the declarations of its sales (takerTag): "By" names the assistant. */
  takerKey: Uint8Array;
  /** Its own invoices (src/lib/invoice/record.ts), which the owner reads with its own. */
  invoices: InvoiceKeys;
  /**
   * The owner's grant of the transactions' export to it (src/lib/assistant/export-grant.ts): the
   * NIP-44 key and the key of the `d` tags of its records, which the team signs. Whoever holds the
   * assistant's key reads them; only the owner writes them.
   */
  exportGrant: { encryptionKey: Uint8Array; addressKey: Uint8Array };
};

export function deriveAssistantKeys(key: Uint8Array): AssistantKeys {
  if (key.length !== KEY_LENGTH) throw new Error("Invalid assistant key");
  const derive = (info: string) => deriveKey(key, ASSISTANT_SALT, info);
  return {
    member: deriveMemberKeys(key),
    takerKey: memberTakerKey(key),
    invoices: {
      nostr: nostrKeys(derive("invoices/author/v1")),
      encryptionKey: derive("invoices/encryption-key/v1"),
      addressKey: derive("invoices/address-key/v1")
    },
    exportGrant: {
      encryptionKey: derive("export/encryption-key/v1"),
      addressKey: derive("export/address-key/v1")
    }
  };
}

/** What an assistant's secret key holds: as an integration's (IntegrationAccess). */
export type AssistantAccess = IntegrationAccess;

/**
 * The beginning of an assistant's secret key: `sattleme` for sattle.me, `ak` for assistant key,
 * saying what it is to whoever finds it (a secret scanner, a log); never an integration's
 * (`sattleme_ck_`), whose reader refuses it, nor the reverse. A later format takes another prefix
 * (`sattleme_ak2_`), which this reader refuses.
 */
export const ASSISTANT_KEY_PREFIX = "sattleme_ak_";

/** An assistant's secret key: ASSISTANT_KEY_PREFIX, then `<team>.<key>.<relays>` (formatSeatKey). */
export function formatAssistantKey(access: AssistantAccess): string {
  return formatSeatKey(ASSISTANT_KEY_PREFIX, access);
}

/** What formatAssistantKey wrote, null when it is not that (a key cut short, another text). */
export function parseAssistantKey(text: string): AssistantAccess | null {
  return parseSeatKey(ASSISTANT_KEY_PREFIX, text);
}
