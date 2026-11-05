import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { Loader } from "@components";
import { useLocation } from "@components/Router";
import { apiRootUrl } from "@config/apiRootUrl";
import { sattlemeUrl } from "@config/sattlemeUrl";
import {
  ACTIVATION_KEY,
  answerUrl,
  destinationOf,
  readV2BrowserState,
  requestUrl,
  welcomeUrl
} from "@utils/sattleme/handoff";
import { freshToken } from "@utils/sattleme/freshToken";
import { WalletWordsNotice } from "./WalletWordsNotice";

const readActivation = () => {
  try {
    return window.sessionStorage.getItem(ACTIVATION_KEY) === "1";
  } catch {
    return false;
  }
};

const keepActivation = () => {
  try {
    window.sessionStorage.setItem(ACTIVATION_KEY, "1");
  } catch {
    // Sans le stockage de l'onglet : la caisse arrive sur l'accueil.
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

  const state = readV2BrowserState(window.localStorage);
  const destination = destinationOf(pathname, hash, state, readActivation());

  const leave = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    setIsLeaving(true);
    let url: string;
    if (destination.kind === "request") {
      if (destination.activation) keepActivation();
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
