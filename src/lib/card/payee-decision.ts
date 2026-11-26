import { cleanDescription } from "./card-invoice";
import type { PayeeCheck } from "./payee-proof";
import { isPayeeHomonym, payeeNameKey } from "./payee-names";
import type { ApprovedPayee, CardPayees } from "./payees";

/*
 * Whether a card payment leaves without its holder, from the holder's mode for the card and the
 * payee the phone identified (each card its own mode and merchants): the phone decides, never the
 * relay.
 *
 * - "Automatic": every valid tap is paid, within the card's limits; the payee is shown only.
 * - "Approved merchants" (the default): paid without asking only to an identified merchant the
 *   holder approved; any other payment is confirmed, and a confirmed identified merchant is
 *   approved from then on if the holder chooses so. Identified: by its Lightning address, else by
 *   the node its invoice pays (payee-proof.ts), which may be
 *   shared (Spark's, a custodial wallet's): approving it approves anyone it receives for. A payee
 *   not identified (an invoice no key signed) is never approved: it could be anyone.
 * - "Always confirm": every payment is confirmed.
 *
 * The account closed (the app closed or locked: no seed in memory), only an identified merchant the
 * holder approved is paid without asking, with the card's pass the phone keeps
 * (src/lib/card/card-pass.ts), "Automatic" included: anyone else is confirmed.
 *
 * The card not told yet (the account closed and no card's pass on this phone: the tap is checked
 * after the passkey; several cards of the account on the tap's relay, payment.ts), the decision is
 * taken among the books of the cards it can be (decidePayeeAmong): every payment is confirmed,
 * approved by no confirmation; an identified payee is shown approved only when every one of them
 * approved it, and as a homonym when one of them approved another merchant of its name (an
 * impostor bearing an approved merchant's name is pointed out, whichever card).
 *
 * A payment the holder does not confirm in time is refused, with a reason that tells the merchant
 * what to do (payment.ts). A payee the merchant's service refuses (another invoice, one paid
 * already) never comes here: it is never paid.
 */

/** Who the payment pays, as the holder sees it. Its address is never shown, its node is. */
export type CardPayeeView = {
  /**
   * `approved`: identified and approved; `new`: identified, not approved; `unidentified`: not
   * identified; `unchecked`: "Automatic", whoever it is.
   */
  status: "approved" | "new" | "unidentified" | "unchecked";
  /**
   * The name it declared (a node's: the alias it announces), cleaned for display; null when not
   * identified, without a name, or a node whose alias was not read.
   */
  name: string | null;
  /**
   * How it is identified: by its Lightning address (the point of sale's proof) or by its invoice's
   * node; null when not identified. Shown as "unchecked" too ("Automatic").
   */
  by: "address" | "node" | null;
  /** Its node's key (hex), when identified by it: what names it, shortened at the display edge. */
  node: string | null;
  /** When the holder approved it (ms), for `approved`. */
  approvedAt: number | null;
  /** The holder's own name for it, for `approved`. */
  localName: string | null;
  /** The name it was approved under, for `approved`, when it declares another one now. */
  formerName: string | null;
  /** Identified, not approved, and bearing the name of an approved merchant. */
  homonym: boolean;
};

/** Why the holder is asked, which is also what the point of sale is told when nobody confirms. */
export type CardConfirmationCause =
  /** Identified, not approved: a new merchant, to approve in the app. */
  | "newPayee"
  /** Not identified: a merchant not identified, to confirm in the app. */
  | "unidentifiedPayee"
  /** "Always confirm", or the app locked: a payment to confirm in the app. */
  | "unconfirmed";

export type PayeeDecision = {
  payee: CardPayeeView;
  /** Paid without asking (once the tap is checked, the account open). */
  automatic: boolean;
  /**
   * Paid without asking the account closed (once the tap is checked with the card root the phone
   * keeps): an identified, approved merchant, in any mode but "Always confirm".
   */
  automaticLocked: boolean;
  /** Why the holder is asked when it is not paid without asking. */
  cause: CardConfirmationCause;
  /**
   * Approvable as the holder confirms the payment ("Approved merchants"): approved only if they
   * tick "Approve this merchant" (CardPaymentSheet.tsx).
   */
  approveOnConfirm: boolean;
};

/** A payee the mode decides on: a refused one is never paid, whatever the mode. */
export type CheckedPayee = Exclude<PayeeCheck, { status: "refused" }>;

/**
 * The decision while the tapped card is not told yet, among the books of the cards it can be
 * (`candidates`: the wallet's active cards on the tap's relay, see above). None: as if no card
 * approved anyone.
 */
export function decidePayeeAmong(
  candidates: readonly CardPayees[],
  check: CheckedPayee
): PayeeDecision {
  const identified = check.status === "identified" ? check.payee : null;
  const asked = { automatic: false, automaticLocked: false, approveOnConfirm: false } as const;
  if (identified === null) {
    return {
      payee: {
        status: "unidentified",
        name: null,
        by: null,
        node: null,
        approvedAt: null,
        localName: null,
        formerName: null,
        homonym: false
      },
      cause: "unidentifiedPayee",
      ...asked
    };
  }
  const known = candidates.map(
    (payees) => payees.approved.find((entry) => entry.id === identified.id) ?? null
  );
  const approvedByAll = known.length > 0 && known.every((entry) => entry !== null);
  const approvedBySome = known.some((entry) => entry !== null);
  /** What every candidate says the same of it, else null. */
  const common = (of: (entry: ApprovedPayee) => string | null): string | null => {
    const values = new Set(known.map((entry) => (entry ? of(entry) : null)));
    return values.size === 1 ? [...values][0] : null;
  };
  const approvedName = approvedByAll ? common((entry) => entry.approvedName) : null;
  return {
    payee: {
      status: approvedByAll ? "approved" : "new",
      name: identified.name === null ? null : cleanDescription(identified.name),
      by: identified.by,
      node: identified.by === "node" ? identified.id : null,
      // Approved for whichever card it is from then on.
      approvedAt: approvedByAll ? Math.max(...known.map((entry) => entry!.approvedAt)) : null,
      localName: approvedByAll ? common((entry) => entry.localName) : null,
      formerName: formerNameOf(approvedName, identified.name),
      homonym:
        !approvedByAll && candidates.some((payees) => isPayeeHomonym(payees.approved, identified))
    },
    // Approved for some of them only: it may be the tapped card's new merchant, or not.
    cause: approvedBySome ? "unconfirmed" : "newPayee",
    ...asked
  };
}

/**
 * The name an approved merchant was approved under (`approvedName`), when it declares another one
 * now (`name`; null: a node whose alias was not read, which says nothing of it).
 */
function formerNameOf(approvedName: string | null, name: string | null): string | null {
  return approvedName !== null && name !== null && payeeNameKey(approvedName) !== payeeNameKey(name)
    ? cleanDescription(approvedName)
    : null;
}

/** The decision for a payment of the card whose mode and merchants are `payees`. */
export function decidePayee(payees: CardPayees, check: CheckedPayee): PayeeDecision {
  const identified = check.status === "identified" ? check.payee : null;
  const known = identified
    ? (payees.approved.find((entry) => entry.id === identified.id) ?? null)
    : null;
  const name = identified?.name ? cleanDescription(identified.name) : null;
  const shown: CardPayeeView = {
    status: identified === null ? "unidentified" : known ? "approved" : "new",
    name,
    by: identified?.by ?? null,
    node: identified?.by === "node" ? identified.id : null,
    approvedAt: known?.approvedAt ?? null,
    localName: known?.localName ?? null,
    formerName: known ? formerNameOf(known.approvedName, identified!.name) : null,
    homonym: identified !== null && known === null && isPayeeHomonym(payees.approved, identified)
  };
  const cause: CardConfirmationCause =
    shown.status === "new"
      ? "newPayee"
      : shown.status === "unidentified"
        ? "unidentifiedPayee"
        : "unconfirmed";
  const approved = shown.status === "approved";
  switch (payees.mode) {
    case "automatic":
      return {
        payee: { ...shown, status: "unchecked", approvedAt: null, formerName: null },
        automatic: true,
        automaticLocked: approved,
        cause: "unconfirmed",
        approveOnConfirm: false
      };
    case "approved":
      return {
        payee: shown,
        automatic: approved,
        automaticLocked: approved,
        cause,
        approveOnConfirm: shown.status === "new"
      };
    case "confirm":
      return {
        payee: shown,
        automatic: false,
        automaticLocked: false,
        cause,
        approveOnConfirm: false
      };
  }
}
