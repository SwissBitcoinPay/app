/*
 * The CSV of "Export" on the web (share.ts in the apps): the browser downloads it, named after the
 * business and the period, from this page. How long the download's object URL stays, after which
 * the browser frees it (as the journal's copy, src/features/support/mail.web.ts).
 */
const DOWNLOAD_LIFETIME_MS = 60_000;

/** Downloads `text` as `fileName` (`_title` is the apps' share sheet's). */
export async function shareCsv(text: string, fileName: string, _title: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_LIFETIME_MS);
}
