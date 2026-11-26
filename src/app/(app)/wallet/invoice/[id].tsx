import { Redirect, useLocalSearchParams } from "expo-router";

import { InvoiceDetail } from "@/features/invoices/InvoiceDetail";
import { usePos } from "@/features/terminal/pos";
import { isMemberProfile } from "@/lib/terminal/model";

const ID = /^[0-9a-f]{32}$/;

/** An invoice of "New invoice" (src/features/invoices/), the owner's only. */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = usePos();
  if (isMemberProfile(profile) || typeof id !== "string" || !ID.test(id)) {
    return <Redirect href="/wallet" />;
  }
  return <InvoiceDetail id={id} />;
}
