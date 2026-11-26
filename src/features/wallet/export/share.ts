import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { withSystemUi } from "@/lib/system-ui";

/*
 * The CSV of "Export" in the apps (share.web.ts on the web): a file of the app's cache, named after
 * the business and the period, that the system's share sheet sends, saves to Files or opens in a
 * spreadsheet (expo-sharing, as the invoice's PDF, src/features/invoices/pdf.ts). The same name for
 * the same period: the copy shared last replaces the one before.
 */

/** Writes `text` as `fileName` in the cache, then opens the share sheet with it. */
export async function shareCsv(text: string, fileName: string, title: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  file.writeSync(text);
  // The system's share sheet over the app: coming back is not leaving it (src/lib/system-ui.ts).
  await withSystemUi(() =>
    Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: title
    })
  );
}
