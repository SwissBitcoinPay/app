/**
 * Same API as followed-sales-store.ts, in the browser's `localStorage`: one entry. In this browser
 * only, gone with the site data ("Log out" clears it all, device-wipe.web.ts). Never rename
 * it.
 */
export const FOLLOWED_SALES_DIR_NAME = "followed-sales";

export async function readFollowedSales(): Promise<string | null> {
  return localStorage.getItem(FOLLOWED_SALES_DIR_NAME);
}

export async function writeFollowedSales(record: string | null): Promise<void> {
  if (record === null) localStorage.removeItem(FOLLOWED_SALES_DIR_NAME);
  else localStorage.setItem(FOLLOWED_SALES_DIR_NAME, record);
}
