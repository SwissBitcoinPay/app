import createQrCode from "qrcode-generator";

/** Dark modules side by side on one row of a QR code: `length` of them from column `start`. */
export type QrRun = { start: number; length: number };

type QrRuns = { count: number; rows: readonly (readonly QrRun[])[] };

/**
 * The last code made: QrPlate and BlurredQr draw the same value at once (the blurred copy over the
 * plate), and making a long BIP-21 code tries all eight masks.
 */
let last: { value: string; runs: QrRuns } | null = null;

/**
 * The dark modules of `value`'s QR code (error correction M), row by row as horizontal runs, and
 * the number of modules on a side: QrPlate draws each run as a View, BlurredQr as part of a path.
 */
export function qrRuns(value: string): QrRuns {
  if (last?.value === value) return last.runs;
  const code = createQrCode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const rows: QrRun[][] = [];
  for (let row = 0; row < count; row++) {
    const runs: QrRun[] = [];
    let col = 0;
    while (col < count) {
      if (code.isDark(row, col)) {
        const start = col;
        while (col < count && code.isDark(row, col)) col++;
        runs.push({ start, length: col - start });
      } else {
        col++;
      }
    }
    rows.push(runs);
  }
  last = { value, runs: { count, rows } };
  return last.runs;
}
