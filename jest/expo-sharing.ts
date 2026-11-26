/** expo-sharing under Jest (src/features/invoices/pdf.ts): the files shared, no share sheet. */

export const shared: { url: string; options: unknown }[] = [];

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function shareAsync(url: string, options: unknown = {}): Promise<void> {
  shared.push({ url, options });
}

export function resetSharing(): void {
  shared.length = 0;
}
