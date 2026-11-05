import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { Loader } from "@components";
import { apiRootUrl } from "@config/apiRootUrl";
import { sattlemeUrl } from "@config/sattlemeUrl";
import {
  destinationOf,
  handoffUrl,
  readV2BrowserState
} from "@utils/sattleme/handoff";
import { freshToken } from "@utils/sattleme/freshToken";
import { WalletWordsNotice } from "./WalletWordsNotice";

// Dès le 26.11.2026, l'app web v2 envoie ses utilisateurs sur l'app web de
// sattle.me (demande du 05.11.2026, SwissBitcoinPay/new-app,
// docs/etude-migration-v2.md, « Les apps web v2 ») : le propriétaire avec la
// copie de son compte et un jeton court de sa session, la caisse avec la copie
// du compte (sattle.me lui demande d'attendre l'invitation du responsable), un
// visiteur sans compte sur l'accueil. Lu une fois, au chargement, avant tout
// écran de l'app v2 et sans dépendre de son serveur. Seules restent les pages
// des payeurs (`handoff.ts`). Ce navigateur garde tout ce qu'il avait : rien
// n'est effacé ici.
export const SattlemeGate = ({ children }: PropsWithChildren) => {
  const [state] = useState(() => readV2BrowserState(window.localStorage));
  const [destination] = useState(() =>
    destinationOf(window.location.pathname, state)
  );
  const [isLeaving, setIsLeaving] = useState(false);
  // Une seule fois, même si l'écran est rendu deux fois.
  const left = useRef(false);

  const leave = useCallback(async () => {
    if (destination.kind !== "leave" || left.current) return;
    left.current = true;
    setIsLeaving(true);
    const token =
      destination.role === "owner"
        ? await freshToken(apiRootUrl, state.refreshToken)
        : undefined;
    // `replace` : un retour arrière ne ramène pas ici.
    window.location.replace(
      handoffUrl(sattlemeUrl, destination.role, state.account, token)
    );
  }, [destination, state]);

  const askWords = destination.kind === "leave" && destination.askWords;

  useEffect(() => {
    if (destination.kind === "leave" && !askWords) void leave();
  }, [destination, askWords, leave]);

  if (destination.kind === "stay") return <>{children}</>;
  if (askWords) {
    return (
      <WalletWordsNotice
        onContinue={() => {
          void leave();
        }}
        isLeaving={isLeaving}
      />
    );
  }
  return <Loader />;
};
