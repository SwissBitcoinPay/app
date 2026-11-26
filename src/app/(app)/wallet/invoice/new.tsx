import { useLocalSearchParams } from "expo-router";

import { InvoiceWizard, type WizardStart } from "@/features/invoices/InvoiceWizard";

const ID = /^[0-9a-f]{32}$/;

/**
 * "New invoice" (src/features/invoices/), the owner's only: a new invoice, a draft to
 * finish (`?draft=<id>`), or a copy of an invoice (`?copy=<id>`, "Duplicate").
 */
export default function NewInvoice() {
  const { draft, copy } = useLocalSearchParams<{ draft?: string; copy?: string }>();
  const start: WizardStart =
    typeof draft === "string" && ID.test(draft)
      ? { kind: "draft", id: draft }
      : typeof copy === "string" && ID.test(copy)
        ? { kind: "copy", id: copy }
        : { kind: "new" };
  return <InvoiceWizard start={start} />;
}
