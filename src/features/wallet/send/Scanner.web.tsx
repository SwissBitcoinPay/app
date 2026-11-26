/**
 * No QR scan on the web (no scan icon, for want of a camera): the field and "Paste" only. Kept out
 * of the web bundle, with expo-camera.
 */
export const canScan = false;

export function Scanner(_props: { onScanned: (data: string) => void; onCancel: () => void }) {
  return null;
}
