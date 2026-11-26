import { useEffect, useState } from "react";

import { passkeysReady, preparePasskeys } from "@/lib/breez/passkey";

/**
 * Whether a tap cannot ask for the passkey yet: on the web, the SDK must be ready by the tap (see
 * preparePasskeys), so a button that asks for the passkey shows a spinner and cannot be tapped
 * until it is loaded. A failed load (offline) ends it too: the next tap loads the SDK again. Never
 * on native.
 */
export function usePasskeysPreparing(): boolean {
  const [preparing, setPreparing] = useState(() => !passkeysReady());
  useEffect(() => {
    let live = true;
    // Whatever the first render saw: a load may end between it and this effect.
    void preparePasskeys().then(() => {
      if (live) setPreparing(false);
    });
    return () => {
      live = false;
    };
  }, []);
  return preparing;
}
