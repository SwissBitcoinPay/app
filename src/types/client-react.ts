// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.
//
// Hook React opt-in qui wrap `initApi({storage})` côté composant.
// Pré-requis côté front : `npm i react`. Ce fichier introduit la
// dépendance `react` ; tant qu'on n'importe pas de ce module, le
// `client.ts` reste consommable hors React.

import { useEffect, useState } from "react";
import { initApi, type Storage } from "./client.js";

// Appelle `initApi({storage})` au mount. Retourne `true` une fois la
// promise résolue. Idempotent grâce au singleton interne d'`initApi` :
// re-mount d'un composant qui consomme ce hook ne re-init pas.
//
// `opts.storage` doit être une référence stable (cf. `window.localStorage`,
// instance singleton AsyncStorage) — le hook ne réagit pas aux changements
// de cette référence (deps `[]` intentionnel).
export function useApiReady(opts: { storage: Storage }): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    initApi(opts).then(
      () => {
        if (!cancelled) setReady(true);
      },
      (err) => {
        console.error("initApi failed", err);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready;
}
