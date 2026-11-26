/*
 * Same API as handheld.ts. In a browser, a phone or a tablet is told by its primary pointer: a
 * finger (`pointer: coarse`, in every browser since 2018), where a computer's is a mouse or a
 * trackpad (`fine`), touchscreen laptops included. Without the media query: a computer.
 */
export function isHandheld(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(pointer: coarse)").matches
  );
}
