import { bytesToHex } from "@noble/hashes/utils.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPaymentLinkOrigin } from "@/config/payment-links";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { logFailure } from "@/lib/log/log";
import type { PayerNode } from "@/lib/onchain/node";
import { shareUrl } from "@/lib/payment-link/device";
import { shareWithSystem } from "@/lib/system-ui";
import { finalizePendingLink, followLink } from "@/features/payment-link/finalize";
import { recordLink } from "@/features/team/member";
import { createPaymentLink, publishPaymentLink, type PaymentLink } from "@/lib/payment-link/link";
import {
  linkRegistryEpoch,
  PAYMENT_LINK_VERSION,
  parsePaymentLinkPayload,
  type PaymentLinkPayload
} from "@/lib/payment-link/payload";
import { pendingOf, savePendingLink } from "@/lib/payment-link/pending";
import type { BusinessRegistry } from "@/lib/registry/registry";

import type { PointOfSaleProfile, Sale } from "./pos";
import { invoiceNetwork } from "./invoice";
import { addressPoolOf, keepAddressForLink } from "./onchain-pool";
import type { Settlement } from "./useSale";

export type PaymentLinkFeedback =
  /** The browser has no share sheet: the link was copied instead. */
  | "copied"
  /** No relay took the link: the payer's page would not find it. Sharing again retries. */
  | "publishFailed"
  /** Neither the share sheet nor the clipboard took the link. */
  | "shareFailed";

/**
 * What the payer's page needs of a sale to ask and declare its own invoices: the point of sale's
 * amount and names, its end, its on-chain address, and the business's registry (its key, the
 * public halves of its reading key and of its link owner key).
 */
export function paymentLinkPayload(
  offer: Pick<PaymentOffer, "address" | "endsAt">,
  sale: Sale,
  profile: PointOfSaleProfile,
  digits: number,
  business: BusinessRegistry,
  /** Who took the sale (takerTag): the page's declarations carry it. */
  taker: string | null = null,
  /** The merchant's node, when the owner passes it on to the payers' pages (payerNodeOf). */
  payerNode: PayerNode | null = null
): PaymentLinkPayload {
  return {
    version: PAYMENT_LINK_VERSION,
    businessName: profile.businessName,
    lightningAddress: profile.lightningAddress,
    fiat: { minor: sale.minor, digits, currency: profile.currency },
    note: sale.note.trim(),
    onchainAddress: offer.address,
    endsAt: offer.endsAt,
    registryKey: bytesToHex(business.key),
    registryReader: business.reader,
    // The export epoch this device seals the registry at (payload.ts): the page seals at it too.
    ...linkRegistryEpoch(business.reader),
    owner: business.owner,
    ...(taker ? { taker } : {}),
    ...(payerNode ? { bitcoinNode: payerNode } : {})
  };
}

/** What the screen asks the payer for, and so what "Share" shares. */
export type PaymentOffer = {
  /** The sale's on-chain address, null for a Lightning only sale. */
  address: string | null;
  /** Unix seconds: the end of the sale before any payment. */
  endsAt: number;
  /**
   * The QR's content, shared as is by a build without a web app for its links; null while the QR
   * shows none yet.
   */
  uri: string | null;
};

type Current = {
  /** The sale the link is of: another sale makes another link. */
  sale: Sale;
  link: PaymentLink;
  /** Whether a relay took the link's event, or one is being asked. */
  publication: "none" | "publishing" | "published";
};

/**
 * Publishes the link's event, unless a relay took it or is being asked; `onFailure` when none took
 * it (then the next call publishes it again).
 */
function publish(entry: Current, onFailure: () => void): void {
  if (entry.publication !== "none") return;
  entry.publication = "publishing";
  const { link } = entry;
  publishPaymentLink(link).then(
    () => {
      entry.publication = "published";
    },
    (error: unknown) => {
      logFailure("Publishing the payment link failed", error);
      entry.publication = "none";
      onFailure();
    }
  );
}

/**
 * "Share" on the sale shown: a payment link (src/lib/payment-link/) made at the first tap and
 * shared again by the next ones, one per sale. The share sheet opens at once, while the link is
 * published: the merchant picks the recipient meanwhile. When no relay takes it, a notification says
 * so; sharing again publishes the same link, which the payer may already hold. The link carries the
 * sale, never an invoice: the payer's page asks and declares its own, hour by hour, so it works
 * while this screen is closed. It never expires.
 *
 * The link is kept on the device until its final version is published (pending.ts): at once when
 * this screen sees the sale paid (`settlement`), else by the pending links' worker once the screen
 * is gone (src/features/payment-link/PendingLinksFinalizer.tsx).
 *
 * What became of it shows as a notification: the link copied (success), or why it does
 * not work yet (error, with "Try again", which shares again). A failed publication is not replaced
 * by a later "copied": the link does not work until it is published. Sharing again, another sale,
 * no request on screen (paid, expired, the next hour's invoice being asked) or leaving the screen
 * takes the message away.
 *
 * A build without a web app for its payment links (no RP ID: local, CI), or a device without the
 * business's registry key yet, shares the QR's content.
 */
export function usePaymentLink({
  offer,
  sale,
  profile,
  digits,
  business,
  taker = null,
  payerNode = null,
  tolerance,
  settlement
}: {
  /** What the screen asks for, null while it asks for nothing. */
  offer: PaymentOffer | null;
  sale: Sale;
  profile: PointOfSaleProfile;
  digits: number;
  /** The business's registry on this device: no payment link without it. */
  business: BusinessRegistry | null;
  /** Who took the sale (takerTag of the sale's registry): the link carries it to its page. */
  taker?: string | null;
  /**
   * The merchant's node, when the owner passes it on to the payers' pages (payerNodeOf):
   * the link carries it, its page reads the chain there.
   */
  payerNode?: PayerNode | null;
  /**
   * The sale's tolerance of on-chain underpayments (basis points, held from its start): kept with
   * the link on this device and in its record for the owner, who settle the sale with it. Never in
   * the link: its payer reads it.
   */
  tolerance: number;
  /**
   * The sale's settlement once it is paid, expired or underpaid past its end (useSale): its link's
   * final version, published here at once when paid.
   */
  settlement: Settlement | null;
}): { share: () => void } {
  const { t } = useTranslation();
  const { notify, dismiss } = useNotifications();
  // Where the sale's on-chain address came from: it goes back there with the link's final version.
  const pool = useMemo(() => addressPoolOf(profile), [profile]);
  const current = useRef<Current | null>(null);
  // The sale whose request is shown: a message for another (a publication ending late) is dropped.
  const shownSale = useRef<Sale | null>(null);
  // The last message, for its sale.
  const last = useRef<{ sale: Sale; feedback: PaymentLinkFeedback; id: number } | null>(null);
  // "Try again" shares the sale shown when it is pressed.
  const shareAgain = useRef<() => void>(() => undefined);

  const show = useCallback(
    (forSale: Sale, feedback: PaymentLinkFeedback | null) => {
      if (forSale !== shownSale.current) return;
      if (feedback === null) {
        if (last.current) dismiss(last.current.id);
        last.current = null;
        return;
      }
      const id = notify({
        tone: feedback === "copied" ? "success" : "error",
        title: t(`pos.shareLink.${feedback}Title`),
        body: t(`pos.shareLink.${feedback}`),
        key: "payment-link",
        action:
          feedback === "copied"
            ? undefined
            : {
                label: t("pos.failed.retry"),
                icon: "arrow-rotate-right",
                onPress: () => shareAgain.current()
              }
      });
      last.current = { sale: forSale, feedback, id };
    },
    [notify, dismiss, t]
  );

  // Another sale, or no request shown (paid, expired, the next hour's invoice being asked, left):
  // the last message goes. The link stays the same through the sale's hours.
  const asking = offer !== null ? sale : null;
  useEffect(() => {
    shownSale.current = asking;
    return () => {
      shownSale.current = null;
      if (last.current) dismiss(last.current.id);
      last.current = null;
    };
  }, [asking, dismiss]);

  // The sale's link, once made: this screen follows its sale, the pending links' worker leaves it.
  const [linkId, setLinkId] = useState<{ sale: Sale; id: string } | null>(null);
  const followedId = linkId?.sale === sale ? linkId.id : null;
  useEffect(() => (followedId === null ? undefined : followLink(followedId)), [followedId]);

  // Paid: the link's final version, at once, tried once here (an expired sale's waits 3 hours,
  // and a failure is tried again, by the worker once this screen is gone).
  const paidSettlement = settlement?.status === "paid" ? settlement : null;
  const finalized = useRef<string | null>(null);
  useEffect(() => {
    const entry = current.current;
    if (!paidSettlement || !entry || entry.sale !== sale || followedId === null) return;
    if (finalized.current === followedId) return;
    finalized.current = followedId;
    void finalizePendingLink(
      pendingOf(entry.link, entry.link.payload.onchainAddress === null ? null : pool, tolerance),
      paidSettlement
    );
  }, [paidSettlement, sale, followedId, pool, tolerance]);

  const share = () => {
    if (!offer) return;
    const origin = getPaymentLinkOrigin();
    // No web app for the links, or no registry key on this device yet: the code itself.
    if (origin === null || business === null) {
      if (offer.uri !== null) void shareWithSystem({ message: offer.uri }).catch(() => undefined);
      return;
    }
    const feedback = (next: PaymentLinkFeedback | null) => show(sale, next);
    let entry = current.current;
    if (entry?.sale !== sale) {
      const payload = paymentLinkPayload(offer, sale, profile, digits, business, taker, payerNode);
      try {
        // The payer's page would refuse it (a business name too long…): never shared.
        if (!parsePaymentLinkPayload(payload, invoiceNetwork())) throw new Error("Invalid payload");
        entry = {
          sale,
          // Sealed with the sale's own key: the payer's page declares its invoices with the keys
          // it gives (src/lib/registry/).
          link: createPaymentLink(payload, origin, undefined, sale.key, sale.relays),
          publication: "none"
        };
      } catch (error) {
        logFailure("Creating the payment link failed", error);
        feedback("shareFailed");
        return;
      }
      current.current = entry;
      setLinkId({ sale, id: entry.link.id });
      // Kept until its final version is published, also after a restart; its on-chain address
      // goes back to the pool with it when nothing paid it (finalize.ts), never before.
      if (offer.address !== null) keepAddressForLink(offer.address);
      savePendingLink(entry.link, offer.address === null ? null : pool, tolerance).catch(
        (error: unknown) => {
          logFailure("Keeping the payment link failed", error);
        }
      );
      // The owner can publish its final version if this device does not, and sees from any of its
      // devices that the sale is not final yet (an employee's, or one of its own devices).
      recordLink(profile, {
        id: entry.link.id,
        key: entry.link.key,
        createdAt: entry.link.event.created_at,
        onchainAddress: entry.link.payload.onchainAddress,
        relays: entry.link.relays,
        secretKey: entry.link.secretKey,
        business,
        tolerance
      });
    }
    const link = entry;
    feedback(null);
    // First, within the tap: browsers only open their share sheet right after a gesture.
    const sharing = shareUrl(link.link.url);
    publish(link, () => feedback("publishFailed"));
    // A failed publication keeps its message: the link does not work until it is published.
    const unlessUnpublished = (next: PaymentLinkFeedback) => {
      if (last.current?.sale === sale && last.current.feedback === "publishFailed") return;
      feedback(next);
    };
    sharing.then(
      (outcome) => {
        if (outcome === "copied") unlessUnpublished("copied");
      },
      (error: unknown) => {
        logFailure("Sharing the payment link failed", error);
        unlessUnpublished("shareFailed");
      }
    );
  };

  useEffect(() => {
    shareAgain.current = share;
  });

  return { share };
}
