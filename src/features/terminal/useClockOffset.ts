import { useEffect, useState } from "react";

import { clockOffsetSeconds, subscribeClock } from "@/lib/clock";

/**
 * The correction of this device's clock (src/lib/clock.ts), as state: what is computed from it (a
 * sale's start) is computed again once an invoice's date corrects it. Read inside a render, the
 * React Compiler would keep its first value.
 */
export function useClockOffset(): number {
  const [offset, setOffset] = useState(clockOffsetSeconds);
  useEffect(() => subscribeClock(() => setOffset(clockOffsetSeconds())), []);
  return offset;
}
