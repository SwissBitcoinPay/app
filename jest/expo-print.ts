import { Directory, File, Paths } from "./expo-file-system";

/**
 * expo-print under Jest (src/features/invoices/pdf.ts): what was printed, and a file of the cache
 * (the file-system fake) for each HTML turned into a PDF, as expo-print writes it. No native
 * printing: the file holds the HTML.
 */

/** What a PDF was asked with but its HTML: its page's size and margins (in points). */
export type PageOptions = {
  width?: number;
  height?: number;
  margins?: { top: number; right: number; bottom: number; left: number };
};

export const printed: { html: string }[] = [];
export const files: { html: string; uri: string; page: PageOptions }[] = [];

export async function printAsync(options: { html?: string }): Promise<void> {
  printed.push({ html: options.html ?? "" });
}

export async function printToFileAsync(
  options: { html?: string } & PageOptions
): Promise<{ uri: string; numberOfPages: number }> {
  const directory = new Directory(Paths.cache, "Print");
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${files.length + 1}.pdf`);
  file.writeSync(options.html ?? "");
  const { width, height, margins } = options;
  files.push({ html: options.html ?? "", uri: file.uri, page: { width, height, margins } });
  return { uri: file.uri, numberOfPages: 1 };
}

export function resetPrint(): void {
  printed.length = 0;
  files.length = 0;
}
