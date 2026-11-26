import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { MemberAppShell } from "@/features/navigation/AppShell";
import {
  DESTINATION_HREFS,
  MEMBER_DESTINATIONS,
  destinationOf
} from "@/features/navigation/destinations";
import { useInvoiceWait } from "@/features/terminal/pos";

import { useMembershipSync, useMembershipWatch } from "./useTeamSync";

/**
 * The app of an employee's device: the point of sale, "My activity" (its own sales and links)
 * and "Settings" (the employee's photo, the business's relays, "Leave the business"), in a
 * minimal navigation (MemberAppShell). No padlock: the device
 * holds no passkey of the account, the other destinations are the owner's. A link to one of them
 * leads to the point of sale; a screen out of the app's destinations (a payment link's page, open
 * to anyone, pushed over it) stays. While an invoice shows, a removal reaches the device at once
 * (useMembershipWatch).
 */
export function MemberShell() {
  useMembershipSync();
  const pathname = usePathname();
  // While an invoice shows, or waits on another screen: a removal stops it at once.
  const invoiceWait = useInvoiceWait();
  useMembershipWatch(pathname.startsWith("/pos/charge") || invoiceWait !== null);
  const destination = destinationOf(pathname);
  const away = destination !== null && !MEMBER_DESTINATIONS.includes(destination);
  // The router of this tree, not the global one: Expo Router 58's is unavailable until the first
  // render has finished, which a link opened at launch is part of.
  const router = useRouter();
  useEffect(() => {
    if (away) router.replace(DESTINATION_HREFS.pos);
  }, [away, router]);
  return <MemberAppShell />;
}
