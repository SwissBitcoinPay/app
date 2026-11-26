import type { TFunction } from "i18next";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { CountryPicker } from "@/components/CountryPicker";
import { Sheet } from "@/components/ui/Sheet";
import { mtpLoginFlow, type AccountMtpAccess } from "@/features/sell/account-flow";
import {
  SellLoginContext,
  type CountryRequest,
  type SellLogin
} from "@/features/sell/login-context";
import { LoginStep } from "@/features/sell/SetupPage";
import type { MtpEnvironment } from "@/lib/mtpelerin/environment";

/*
 * The Mt Pelerin login of an account becoming a merchant's, in a panel, opened before the bank
 * details (mtp-gate.tsx: the sign-up's bank step, "Create my merchant
 * profile"'s): the very steps of "Sell"'s login (SetupPage.tsx LoginStep), in a
 * panel of their own: the number and its SMS code in the production app (the account's key on Mt
 * Pelerin's dev/test, in the staging app), then the e-mail when the profile lacks it. Once the
 * profile is complete (flow.ts `signedIn`), the bank step is told (`onSignedIn`), once. The session
 * is the account's: "Sell" finds it.
 *
 * Each opening makes its flow again (mtpLoginFlow), so that it reads the session afresh; closed,
 * the last one stays while its panel leaves (as SellSheet.tsx).
 *
 * The screen under it has said what Mt Pelerin is for, and its button ("Create my Mt Pelerin
 * account", "I already have a Mt Pelerin account": `intent`) what the panel is for: the panel's
 * heading says only how the login goes, never "Sell"'s explanation again. Both buttons lead to the
 * very same login (an account at that number is resumed, one is opened otherwise). The key's login
 * (dev/test) is that button's own: started at once, once per opening, never asked by a second
 * button; failed, its retry; asked again only when the session is lost after it.
 */

type MtpLoginSheetProps = {
  /** The account's Mt Pelerin (signUpMtpAccess, merchantProfileMtpAccess). */
  access: AccountMtpAccess;
  visible: boolean;
  onClose: () => void;
  /** The Mt Pelerin profile is complete: the bank details may be registered there. */
  onSignedIn: () => void;
  /** The button that opened it: a new account, or one the merchant has. */
  intent: MtpLoginIntent;
};

/** Which of the bank step's two buttons opened the login (mtp-gate.tsx MtpLoginActions). */
export type MtpLoginIntent = "create" | "existing";

/** The panel's heading for `intent`: by SMS in the production app, by the account's key on dev/test. */
function loginIntro(t: TFunction, intent: MtpLoginIntent, environment: MtpEnvironment) {
  const by = environment === "production" ? "Sms" : "Key";
  return {
    title: t(`bank.mtPelerin.${intent}Title`),
    lead: t(`bank.mtPelerin.${intent}Lead${by}`)
  };
}

export function MtpLoginSheet(props: MtpLoginSheetProps) {
  const [openings, setOpenings] = useState(props.visible ? 1 : 0);
  const [shown, setShown] = useState(props.visible);
  if (shown !== props.visible) {
    setShown(props.visible);
    if (props.visible) setOpenings((count) => count + 1);
  }
  return openings > 0 ? <LoginPanel key={openings} {...props} /> : null;
}

function LoginPanel({ access, visible, onClose, onSignedIn, intent }: MtpLoginSheetProps) {
  const { t, i18n } = useTranslation();
  const [flow] = useState(() => mtpLoginFlow(access, i18n.language));
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  // The countries' panel (the number's dial code), kept until it has slid out (`onHidden`).
  const [picker, setPicker] = useState<CountryRequest | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void flow.start();
    return () => flow.close();
  }, [flow, visible]);

  // Told once: the bank step closes this panel then.
  const told = useRef(false);
  const signedIn = state.view.name === "signedIn";
  useEffect(() => {
    if (!visible || !signedIn || told.current) return;
    told.current = true;
    onSignedIn();
  }, [visible, signedIn, onSignedIn]);

  // The key's login (dev/test), started once its view is reached, once per opening: a ref, so
  // that an effect run twice starts it once; a state, so that its button stays hidden until then.
  const connectStarted = useRef(false);
  const [connectTried, setConnectTried] = useState(false);
  const connectReady =
    state.view.name === "connect" && state.busy === null && state.failure === null;
  useEffect(() => {
    if (!visible || !connectReady || connectStarted.current) return;
    connectStarted.current = true;
    setConnectTried(true);
    void flow.connect();
  }, [visible, connectReady, flow]);

  const login: SellLogin = {
    flow,
    state,
    pickCountry: (request) => {
      setPicker(request);
      setPicking(true);
    },
    intro: loginIntro(t, intent, access.environment),
    // After the one started here: only a session lost since asks for it (`connectReady`).
    connectButton: connectTried && connectReady
  };
  const { name } = state.view;

  return (
    <Sheet
      title={t("bank.mtPelerin.sheetTitle")}
      closeLabel={t("sell.close")}
      visible={visible}
      onClose={onClose}
      // The code back to the number: the flow's own step back.
      back={name === "code" ? { label: t("sell.back"), onPress: () => flow.back() } : undefined}
      page={name === "unread" || name === "signedIn" ? "starting" : name}
      centered
      dialogWidth={480}
      over={
        picker ? (
          <CountryPicker
            title={picker.title}
            visible={visible && picking}
            value={picker.value}
            suggested={null}
            include={picker.include}
            detail={picker.detail}
            onSelect={picker.onSelect}
            onClose={() => setPicking(false)}
            onHidden={() => setPicker(null)}
          />
        ) : null
      }
      testID="mtp-login-sheet"
    >
      <SellLoginContext.Provider value={login}>
        <LoginStep />
      </SellLoginContext.Provider>
    </Sheet>
  );
}
