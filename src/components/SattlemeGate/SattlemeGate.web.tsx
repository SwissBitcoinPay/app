import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Loader } from "@components";
import { useLocation } from "@components/Router";
import { apiRootUrl } from "@config/apiRootUrl";
import { sattlemeUrl } from "@config/sattlemeUrl";
import {
  answerUrl,
  destinationOf,
  readV2BrowserState,
  requestUrl,
  welcomeUrl,
  type V2BrowserState
} from "@utils/sattleme/handoff";
import { freshToken } from "@utils/sattleme/freshToken";
import { WalletWordsNotice } from "./WalletWordsNotice";

// Un navigateur qui bloque le stockage du site fait lever l'accès même à
// `localStorage` : rien de l'app v2 n'y est alors lisible, et une page de payeur
// doit rester servie.
const readBrowserState = (): V2BrowserState => {
  try {
    return readV2BrowserState(window.localStorage);
  } catch {
    return {
      role: null,
      account: undefined,
      refreshToken: undefined,
      hasWalletWords: false
    };
  }
};

// Dès le 26.11.2026, l'app web v2 envoie ses utilisateurs sur l'app web de
// sattle.me (demande du 05.11.2026, SwissBitcoinPay/new-app,
// docs/etude-migration-v2.md, « Les apps web v2 ») : le propriétaire avec la
// copie de son compte et un jeton court de sa session, la caisse avec la copie
// du compte (sattle.me lui demande d'attendre l'invitation du responsable), un
// visiteur sans compte sur l'accueil ; en trois temps (`handoff.ts`). Seules
// restent les pages des payeurs, à chaque page ouverte, rechargée ou atteinte
// dans l'app, avant tout écran de l'app v2 et sans dépendre de son serveur. Ce
// navigateur garde tout ce qu'il avait : rien n'est effacé ici.
export const SattlemeGate = ({ children }: PropsWithChildren) => {
  const { pathname, hash } = useLocation();
  const [isLeaving, setIsLeaving] = useState(false);
  // Une seule fois, même si l'écran est rendu deux fois.
  const left = useRef(false);

  // Lus à chaque page ouverte ou atteinte dans l'app, pas à chaque rendu.
  const state = useMemo(readBrowserState, [pathname, hash]);
  const destination = useMemo(
    () => destinationOf(pathname, hash, state),
    [pathname, hash, state]
  );

  const leave = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    setIsLeaving(true);
    let url: string;
    if (destination.kind === "request") {
      url = requestUrl(sattlemeUrl);
    } else if (destination.kind === "answer") {
      const token =
        destination.role === "owner"
          ? await freshToken(apiRootUrl, state.refreshToken)
          : undefined;
      url = answerUrl(
        sattlemeUrl,
        destination.nonce,
        destination.role,
        state.account,
        token
      );
    } else {
      url = welcomeUrl(sattlemeUrl);
    }
    // `replace` : un retour arrière ne ramène pas ici.
    window.location.replace(url);
  }, [destination, state]);

  const askWords = destination.kind === "answer" && destination.askWords;

  useEffect(() => {
    if (destination.kind !== "stay" && !askWords) void leave();
  }, [destination.kind, askWords, leave]);

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
