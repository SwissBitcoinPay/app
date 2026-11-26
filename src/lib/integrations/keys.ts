import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { decodeRelayList, encodeRelayList } from "@/lib/relays/list";

/*
 * The secret key of an integration (docs/integrations.md): the owner gives
 * it to the integrator, who keeps it on its server, never in a web page nor in an app. The server
 * does everything: it asks the merchant's Lightning address for each order's invoice, declares it
 * in the registry and checks its payment; the customer's browser only ever gets the invoice. The
 * key (the integration's own, integrationSecretKey of src/lib/team/keys.ts, from the team's root)
 * reads the integration's channel (the business's name, Lightning address and registry, its relays,
 * or "removed") and marks the declarations of its sales ("By"). Whoever holds it can make
 * invoices that pay the merchant, and declare payments whose hash they know for other sales
 * (src/lib/registry/): the owner removes the integration when it leaks.
 *
 * Never change the salt nor the `info` strings once released: the channels of every integration
 * and the marks of its sales derive from them (`integration-keys.test.ts` locks them). The server
 * also derives each order's sale from the key (docs/integrations.md): the app never needs it.
 */

/** Domain of the keys an integration's key gives. */
export const INTEGRATION_SALT = "sattle.me/integration";

const KEY_LENGTH = 32;

/** What an integration's key gives the app (deriveIntegrationKeys). */
export type IntegrationKeys = {
  /** Its channel, signed by the team: `d` tag and NIP-44 key. */
  channel: { address: string; encryptionKey: Uint8Array };
  /**
   * Marks the declarations of its sales (takerTag of src/lib/registry/registry.ts): the owner tells
   * them apart in "Wallet".
   */
  takerKey: Uint8Array;
  /**
   * Its lot of on-chain addresses (src/lib/integrations/onchain-lot.ts), signed by the team and
   * sealed with the channel's key: its `d` tag.
   */
  lotAddress: string;
  /**
   * What its witnesses are made with (src/lib/integrations/onchain-witness.ts, SPEC.md §31): their
   * author, which its server signs with and the owner reads by, and the key of their `d` tags.
   */
  seen: { nostr: NostrKeys; addressKey: Uint8Array };
  /**
   * What its Lightning witnesses are made with (checkout-spec SPEC.md §32): their author, which its
   * server signs with when a check finds an invoice paid, and the key of their `d` tags. The owner
   * gives the author and the key (never the secret) to the assistants it allows to export the
   * transactions (src/lib/assistant/export-grant.ts), which list an integration's Lightning sales
   * of a period by them.
   */
  paid: { nostr: NostrKeys; addressKey: Uint8Array };
};

export function deriveIntegrationKeys(key: Uint8Array): IntegrationKeys {
  if (key.length !== KEY_LENGTH) throw new Error("Invalid integration key");
  const derive = (info: string) => deriveKey(key, INTEGRATION_SALT, info);
  return {
    channel: {
      address: bytesToHex(derive("channel/address/v1")),
      encryptionKey: derive("channel/encryption-key/v1")
    },
    takerKey: derive("taker/v1"),
    lotAddress: bytesToHex(derive("onchain-lot/address/v1")),
    seen: {
      nostr: nostrKeys(derive("onchain-seen/nostr-secret-key/v1")),
      addressKey: derive("onchain-seen/address-key/v1")
    },
    paid: {
      nostr: nostrKeys(derive("lightning-paid/nostr-secret-key/v1")),
      addressKey: derive("lightning-paid/address-key/v1")
    }
  };
}

/** What an integration's secret key holds. */
export type IntegrationAccess = {
  /** Hex: the team's public key, the author of the integration's channel. */
  teamPublicKey: string;
  /** The integration's key (32 bytes). */
  key: Uint8Array;
  /** Where its channel was published when the key was given. */
  relays: readonly string[];
};

/**
 * The beginning of an integration's secret key: `sattleme` for
 * sattle.me, `ck` for checkout key, saying what it is to whoever finds it (a secret scanner, a
 * log); never a dot, which separates the key's parts. Never a URL: nobody opens it in a browser. A
 * later format of the key takes another prefix (`sattleme_ck2_`), which this reader refuses.
 */
export const INTEGRATION_KEY_PREFIX = "sattleme_ck_";

/**
 * An integration's secret key: INTEGRATION_KEY_PREFIX, then `<team>.<key>.<relays>`, the team's
 * public key and the key in canonical base64url, the relays as encodeRelayList writes them (as an
 * invitation's link does). Its alphabet (base64url, ".", "_") needs no quoting in a configuration
 * file nor in a shell.
 */
export function formatIntegrationKey(access: IntegrationAccess): string {
  return formatSeatKey(INTEGRATION_KEY_PREFIX, access);
}

/** What formatIntegrationKey wrote, null when it is not that (a key cut short, another text). */
export function parseIntegrationKey(text: string): IntegrationAccess | null {
  return parseSeatKey(INTEGRATION_KEY_PREFIX, text);
}

/**
 * The secret key of a seat that holds a key of its own (an integration, an assistant:
 * src/lib/assistant/keys.ts): `prefix`, then `<team>.<key>.<relays>` (formatIntegrationKey). The
 * prefix says what the key is; each kind of seat has its own, which the other's reader refuses.
 */
export function formatSeatKey(
  prefix: string,
  { teamPublicKey, key, relays }: IntegrationAccess
): string {
  if (!/^[0-9a-f]{64}$/.test(teamPublicKey)) throw new Error("Invalid team public key");
  if (key.length !== KEY_LENGTH) throw new Error("Invalid seat key");
  return (
    prefix +
    [
      bytesToBase64Url(hexToBytes(teamPublicKey)),
      bytesToBase64Url(key),
      encodeRelayList(relays)
    ].join(".")
  );
}

/** What formatSeatKey wrote with `prefix`, null when it is not that. */
export function parseSeatKey(prefix: string, text: string): IntegrationAccess | null {
  if (!text.startsWith(prefix)) return null;
  const [teamText, keyText, relaysText, ...rest] = text.slice(prefix.length).split(".");
  if (relaysText === undefined || rest.length > 0) return null;
  const team = base64UrlToBytes(teamText);
  const key = base64UrlToBytes(keyText);
  const relays = decodeRelayList(relaysText);
  if (team?.length !== KEY_LENGTH || key?.length !== KEY_LENGTH || relays === null) return null;
  return { teamPublicKey: bytesToHex(team), key, relays };
}
