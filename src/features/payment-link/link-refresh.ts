import { hexToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { inBatches } from "@/lib/batches";
import {
  COPIES_AT_ONCE,
  newestEvents,
  publishAgain,
  publishToRelays,
  queryRelays
} from "@/lib/nostr/pool";
import {
  PAYMENT_LINK_KIND,
  PAYMENT_LINK_TIMEOUT_MS,
  ownerFinalAddress,
  saleLinkAddress,
  signedAgain
} from "@/lib/payment-link/link";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import type { ArchivedLink } from "@/lib/registry/archive";
import { deriveLinkOwner, type TeamKeys } from "@/lib/team/keys";

import { byRelays } from "./owner-finals";

/*
 * The yearly refresh of the payment links the owner's copy of a month holds
 * (src/features/activity/archive.ts): a payer opens a link years later, by its
 * author, and strfry refuses events over 3 years old. The newest copies the link's relays hold are
 * signed again, the same, dated now: its own (link or final version) with the link's key its
 * device sealed for the owner (src/lib/payment-link/sealed-key.ts), and the owner's final version
 * with the owner's key of its sale. A link whose key the copy does not hold, or that cannot be signed
 * again the same (a format this app does not read), is given again as it is, while a relay still
 * takes it. Reads and writes authenticate as the authors whose keys the copy holds (NIP-42): a
 * relay may give and take an author's events from that author only.
 */

/** Links read at once: relays bound the size of a filter. */
const LINKS_PER_READ = 25;

/**
 * Signs again, dated `now` (after each copy), the newest copies the relays of each of `links` hold,
 * each on its own relays, read from a majority of them: a final version is on a majority
 * (publishFinal, publishLinkEvent), so the link is never signed again over its final version.
 * Resolves with how many a majority took; null
 * when a link's copies were not read from a majority, or a copy not taken by one (signed again at
 * the next refresh). Never rejects but when the account closed (the team's keys wiped).
 */
export async function refreshLinks(
  team: TeamKeys,
  links: readonly ArchivedLink[],
  now: number
): Promise<number | null> {
  const network = invoiceNetwork();
  const ownerSecret = deriveLinkOwner(team).secretKey;
  const owner = deriveLinkOwner(team).publicKey;
  let count = 0;
  let complete = true;
  for (const group of byRelays(links)) {
    const relays = group[0]!.relays;
    for (let start = 0; start < group.length; start += LINKS_PER_READ) {
      const chunk = group.slice(start, start + LINKS_PER_READ).map((link) => {
        const saleKey = hexToBytes(link.saleKey);
        return {
          link,
          saleKey,
          own: link.key === null ? null : hexToBytes(link.key),
          ownerSigner: saleOwnerPublicKey(owner, saleKey),
          ownerKey: saleOwnerSecretKey(ownerSecret, saleKey)
        };
      });
      // Each version a link may have, by author and `d` tag: its own (the link or its final
      // version, signed with the link's key when the copy holds it), and the owner's final version.
      const expected = new Map<string, { saleKey: Uint8Array; signer: Uint8Array | null }>();
      for (const { link, saleKey, own, ownerSigner, ownerKey } of chunk) {
        expected.set(`${link.link}:${saleLinkAddress(saleKey)}`, { saleKey, signer: own });
        expected.set(`${ownerSigner}:${ownerFinalAddress(link.link)}`, {
          saleKey,
          signer: ownerKey
        });
      }
      const answers = await queryRelays(
        {
          kinds: [PAYMENT_LINK_KIND],
          authors: chunk.flatMap(({ link, ownerSigner }) => [link.link, ownerSigner]),
          "#d": chunk.flatMap(({ link, saleKey }) => [
            saleLinkAddress(saleKey),
            ownerFinalAddress(link.link)
          ])
        },
        {
          relays,
          timeoutMs: PAYMENT_LINK_TIMEOUT_MS,
          channel: "anonymous",
          authKey: chunk.flatMap(({ own, ownerKey }) => (own ? [own, ownerKey] : [ownerKey]))
        },
        { quorum: "majority" }
      );
      // Fewer than a majority: a final version may be on the others. Nothing signed again.
      if (answers.size < majority(relays.length)) {
        complete = false;
        continue;
      }
      // Signature checked, the newest copy of each address (author and `d` tag), COPIES_AT_ONCE at
      // a time: each publication waits for a majority of the link's relays. Only what was asked: a relay
      // may send other events of these authors (relays are never trusted).
      const versions = newestEvents(answers).flatMap((event) => {
        const d = event.tags.find(([name]) => name === "d")?.[1];
        const version =
          event.kind === PAYMENT_LINK_KIND && d !== undefined
            ? expected.get(`${event.pubkey}:${d}`)
            : undefined;
        return version ? [{ event, ...version }] : [];
      });
      const taken = await inBatches(
        versions,
        COPIES_AT_ONCE,
        async ({ event, saleKey, signer }) => {
          const again =
            signer === null
              ? null
              : signedAgain(event, saleKey, signer, Math.max(now, event.created_at + 1), network);
          const call = {
            relays,
            timeoutMs: PAYMENT_LINK_TIMEOUT_MS,
            // Without the link's key: the connection's own (relay.ts).
            channel: "anonymous" as const,
            authKey: signer ?? undefined
          };
          // Without the link's key, or not signed again the same: given again as it is.
          const took = again
            ? await publishToRelays(again, call, { quorum: "majority" })
            : await publishAgain(event, call, { quorum: "majority" });
          return took.length >= majority(relays.length);
        }
      );
      const held = (taken ?? []).filter(Boolean).length;
      count += held;
      if (taken === null || held < versions.length) complete = false;
    }
  }
  return complete ? count : null;
}
