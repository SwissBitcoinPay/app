import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Flag } from "@/components/ui/Flag";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextField } from "@/components/ui/TextField";
import { CALLING_CODES, DEFAULT_PHONE_COUNTRY, dialCodeOf } from "@/config/calling-codes";
import { getAccountSettings } from "@/features/account/session";
import { usePos } from "@/features/terminal/pos";
import { satsToFiatMinor } from "@/features/wallet/model";
import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import { proposedSellCurrency } from "@/lib/mtpelerin/sale";
import { currencyDigits } from "@/lib/terminal/amount";
import { makeStyles, mono, sans, type, useTheme } from "@/theme";

import { CodeField } from "./CodeField";
import { isEmail, normalizeCode, normalizePhone, type SellView } from "./flow";
import {
  Card,
  Failure,
  Rows,
  SellBody,
  Waiting,
  busyText,
  fiatText,
  satsText,
  timeText
} from "./parts";
import { useSellLogin } from "./login-context";
import { useSellNav } from "./SellSheet";

/*
 * "Sell"'s three steps before a first sale, in its panel:
 * the Mt Pelerin account (its number and the SMS code, or the account's key on dev/test; its
 * e-mail), the wallet checked by 1 sat paid to Mt Pelerin, a bank account. The panel's header
 * draws the three dots; what each step shows comes from the flow (flow.ts); a failure stays under
 * the step's content with its retry.
 */

export function SetupPage() {
  const { t } = useTranslation();
  const { flow, state } = useSellNav();
  const { view, busy } = state;

  switch (view.name) {
    case "starting":
    case "unread":
    case "connect":
    case "phone":
    case "code":
    case "profile":
    case "signedIn":
      return <LoginStep />;
    case "validation":
    case "unaffordable":
      return <ValidationStep view={view} />;
    case "validationPending":
      return (
        <Step
          testID="sell-pending"
          footer={
            view.hasBank ? null : (
              <Button onPress={() => flow.toBank()} testID="sell-pending-bank">
                {t("sell.pending.toBank")}
              </Button>
            )
          }
        >
          <Pending view={view} />
        </Step>
      );
    case "verified":
      return (
        <Step
          testID="sell-verified"
          footer={
            <Button onPress={() => flow.toBank()} testID="sell-verified-continue">
              {view.hasBank ? t("sell.verified.continue") : t("sell.verified.toBank")}
            </Button>
          }
        >
          <Verified view={view} />
        </Step>
      );
    case "bank":
      return <BankStep />;
    case "addressTaken":
      return (
        <Step
          testID="sell-address-taken"
          footer={
            <Button
              variant="secondary"
              loading={busy === "loggingOut"}
              onPress={() => void flow.logout()}
              testID="sell-switch-account"
            >
              {t("sell.addressTaken.switch")}
            </Button>
          }
        >
          <ScreenTitle>{t("sell.addressTaken.title")}</ScreenTitle>
          <Lead>{t("sell.addressTaken.body")}</Lead>
        </Step>
      );
    case "unavailable":
      return (
        <Step testID="sell-unavailable">
          <Callout tone="warning">{t("sell.unavailable")}</Callout>
        </Step>
      );
    case "ready":
      return null;
  }
}

/**
 * The Mt Pelerin login's steps (the first of "Sell"'s; the whole of the merchant sign-up's,
 * src/features/onboarding/MtpLoginSheet.tsx): the number and its SMS code (the account's key on
 * dev/test), then the e-mail when the profile lacks it. Its panel gives it the flow
 * (login-context.ts). Once signed in (the sign-up's, flow.ts `signedIn`), the wait: its panel
 * closes.
 */
export function LoginStep() {
  const { t } = useTranslation();
  const { flow, state, connectButton = true } = useSellLogin();
  const { view, busy } = state;

  switch (view.name) {
    case "connect":
      return (
        <Step
          testID="sell-connect-step"
          footer={
            connectButton ? (
              <Button
                loading={busy === "signingIn"}
                onPress={() => void flow.connect()}
                testID="sell-connect"
              >
                {t("sell.intro.connect")}
              </Button>
            ) : undefined
          }
        >
          <Intro lead={t("sell.intro.connectLead")} />
        </Step>
      );
    case "phone":
      return <PhoneStep />;
    case "code":
      return <CodeStep view={view} />;
    case "profile":
      return <ProfileStep view={view} />;
    default:
      // Mt Pelerin's answers unread (`unread`): under their failure and its retry, the way out of
      // the session ("Log out of Mt Pelerin", as "Settings" has it), lest a read that
      // keeps failing hold the merchant on this account.
      return (
        <Step
          testID="sell-starting"
          footer={
            view.name === "unread" && (state.failure !== null || busy === "loggingOut") ? (
              <Button
                variant="secondary"
                icon="arrow-right-from-bracket"
                loading={busy === "loggingOut"}
                onPress={() => void flow.logout()}
                testID="sell-unread-logout"
              >
                {t("sell.settings.logout")}
              </Button>
            ) : undefined
          }
        >
          {null}
        </Step>
      );
  }
}

/** A step's body: its content, the wait while nothing else says it, the failure; its buttons. */
function Step({
  children,
  footer,
  testID
}: {
  children: ReactNode;
  footer?: ReactNode;
  testID: string;
}) {
  const { t } = useTranslation();
  const { state } = useSellLogin();
  const { busy, failure } = state;
  return (
    <SellBody footer={footer} testID={testID}>
      {children ? <View>{children}</View> : null}
      {busy !== null && !footer ? <Waiting label={busyText(t, busy)} /> : null}
      {failure ? <Failure failure={failure} testID="sell-failure" /> : null}
    </SellBody>
  );
}

/** The login's heading: "Sell"'s, or the one its panel gives (login-context.ts `intro`). */
function Intro({ lead }: { lead: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { state, intro } = useSellLogin();
  return (
    <>
      <ScreenTitle>{intro ? intro.title : t("sell.intro.title")}</ScreenTitle>
      <Lead>{intro ? intro.lead : `${t("sell.intro.lead")} ${lead}`}</Lead>
      {state.sessionLost ? (
        <View style={styles.block}>
          <Callout tone="warning">{t("sell.sessionLost")}</Callout>
        </View>
      ) : null}
    </>
  );
}

/**
 * The country of a number, its flag and dial code ("🇨🇭 +41 ⌄"), as the field's
 * prefix: the countries with a calling code, each with its code (CountryPicker's `detail`).
 */
function DialCodeButton({
  country,
  onChange,
  disabled
}: {
  country: string;
  onChange: (country: string) => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { pickCountry } = useSellLogin();
  const dialCode = dialCodeOf(country) ?? "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sell.intro.dialCodeOf", {
        country: getCountryName(country, i18n.language as Language),
        code: dialCode
      })}
      disabled={disabled}
      hitSlop={6}
      onPress={() =>
        pickCountry({
          title: t("sell.intro.dialCountry"),
          value: country,
          include: (code) => CALLING_CODES[code] !== undefined,
          detail: dialCodeOf,
          onSelect: onChange
        })
      }
      style={styles.dial}
      testID="sell-dial-code"
    >
      <Flag code={country} width={22} />
      <Text style={styles.dialCode}>{dialCode}</Text>
      <Icon name="chevron-down" size={11} color={colors.text.secondary} />
    </Pressable>
  );
}

function PhoneStep() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow, state } = useSellLogin();
  const [text, setText] = useState("");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const dialCode = dialCodeOf(country) ?? "+41";
  const phone = normalizePhone(text, dialCode);
  const submit = () => void flow.submitPhone(text, dialCode);
  return (
    <Step
      testID="sell-phone-step"
      footer={
        <Button
          disabled={phone === null}
          loading={state.busy === "sendingCode"}
          onPress={submit}
          testID="sell-send-code"
        >
          {t("sell.intro.sendCode")}
        </Button>
      }
    >
      <Intro lead={t("sell.intro.phoneLead")} />
      <View style={styles.fields}>
        <TextField
          label={t("sell.intro.phone")}
          value={text}
          onChangeText={setText}
          leading={
            <DialCodeButton
              country={country}
              onChange={setCountry}
              disabled={state.busy !== null}
            />
          }
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          textContentType="telephoneNumber"
          disabled={state.busy !== null}
          onSubmitEditing={phone ? submit : undefined}
          testID="sell-phone"
        />
        <Text style={styles.hint}>{t("sell.intro.phoneHint")}</Text>
      </View>
    </Step>
  );
}

/**
 * The SMS code. Back to the number from the panel's arrow (SellSheet), the only way
 * back. The code to type again, a new one
 * sent ("Send the code again": a view of its own) or the one typed refused or expired once checked
 * (the failure under the boxes says which): the boxes emptied and focused for it.
 */
function CodeStep({ view }: { view: Extract<SellView, { name: "code" }> }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow, state } = useSellLogin();
  const field = useRef<{ focus: () => void }>(null);
  const [text, setText] = useState("");
  const { busy, failure } = state;
  const refused =
    failure?.kind === "codeRefused" || failure?.kind === "codeExpired" ? failure : null;
  const [seen, setSeen] = useState({ view, refused });
  const [askedAgain, setAskedAgain] = useState(0);
  // Once the call ended: the field, disabled meanwhile, could not take the focus in the apps.
  if (busy === null && (seen.view !== view || seen.refused !== refused)) {
    setSeen({ view, refused });
    if (seen.view !== view || refused !== null) {
      setText("");
      setAskedAgain((count) => count + 1);
    }
  }
  useEffect(() => {
    if (askedAgain > 0) field.current?.focus();
  }, [askedAgain]);
  const code = normalizeCode(text);
  const submit = () => void flow.submitCode(text);
  return (
    <Step
      testID="sell-code-step"
      footer={
        <Button
          disabled={code === null}
          loading={busy === "checkingCode"}
          onPress={submit}
          testID="sell-submit-code"
        >
          {t("sell.code.submit")}
        </Button>
      }
    >
      <ScreenTitle>{t("sell.code.title")}</ScreenTitle>
      <Lead>{t("sell.code.lead", { phone: view.phone })}</Lead>
      <View style={styles.fields}>
        <CodeField
          ref={field}
          label={t("sell.code.label")}
          value={text}
          onChangeText={setText}
          length={6}
          disabled={busy !== null}
          onSubmitEditing={code ? submit : undefined}
          testID="sell-code"
        />
        <View style={styles.resend}>
          <Text style={styles.hint}>{t("sell.code.notReceived")}</Text>
          <Button
            variant="text"
            size="sm"
            fullWidth={false}
            disabled={busy !== null}
            onPress={() => void flow.resendCode()}
            testID="sell-resend"
          >
            {t("sell.code.resend")}
          </Button>
        </View>
      </View>
    </Step>
  );
}

function ProfileStep({ view }: { view: Extract<SellView, { name: "profile" }> }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow, state } = useSellLogin();
  const [email, setEmail] = useState(view.person?.email ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phone, setPhone] = useState(view.person?.phone ?? "");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const dialCode = dialCodeOf(country) ?? "+41";
  const known = flow.profilePhone();
  const emailValid = isEmail(email);
  const phoneValid = !view.askPhone || normalizePhone(phone, dialCode) !== null;
  const submit = () =>
    void flow.saveProfile(
      view.askPhone ? { email, phone: normalizePhone(phone, dialCode) ?? phone } : { email }
    );
  return (
    <Step
      testID="sell-profile-step"
      footer={
        <Button
          disabled={!emailValid || !phoneValid}
          loading={state.busy === "savingProfile"}
          onPress={submit}
          testID="sell-save-profile"
        >
          {t("sell.profile.submit")}
        </Button>
      }
    >
      <ScreenTitle>{t("sell.profile.title")}</ScreenTitle>
      <Lead>{t("sell.profile.lead")}</Lead>
      <View style={styles.fields}>
        <TextField
          label={t("sell.profile.email")}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setEmailTouched(true)}
          error={
            emailTouched && email !== "" && !emailValid ? t("sell.profile.emailInvalid") : null
          }
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          disabled={state.busy !== null}
          testID="sell-email"
        />
        {view.askPhone ? (
          <TextField
            label={t("sell.profile.phone")}
            value={phone}
            onChangeText={setPhone}
            leading={
              <DialCodeButton
                country={country}
                onChange={setCountry}
                disabled={state.busy !== null}
              />
            }
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            disabled={state.busy !== null}
            testID="sell-profile-phone"
          />
        ) : null}
      </View>
      {!view.askPhone && known ? (
        <View style={styles.block}>
          <Card>
            <Item icon="mobile-screen-button" title={known} sub={t("sell.profile.phoneCaption")} />
          </Card>
        </View>
      ) : null}
    </Step>
  );
}

/**
 * "Pay 1 sat (less than 0.01 CHF)": 1 sat at today's rate, display only; "less
 * than" the smallest unit when it rounds to nothing, no figure without a rate.
 */
function oneSatLead(t: TFunction, rate: number | undefined, currency: string, languageTag: string) {
  if (rate === undefined) return t("sell.validation.leadNoRate");
  const digits = currencyDigits(currency);
  const minor = satsToFiatMinor(1n, digits, rate);
  const value =
    minor === 0n
      ? t("sell.validation.lessThan", { amount: fiatText(1, currency, languageTag) })
      : t("sell.validation.about", { amount: fiatText(Number(minor), currency, languageTag) });
  return t("sell.validation.lead", { value });
}

function ValidationStep({
  view
}: {
  view: Extract<SellView, { name: "validation" | "unaffordable" }>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow, state } = useSellNav();
  const { languageTag, rate, profile } = usePos();
  const paying = state.busy === "confirming" || state.busy === "paying";
  return (
    <Step
      testID="sell-validation-step"
      footer={
        view.name === "validation" ? (
          <Button
            icon="fingerprint"
            loading={paying}
            onPress={() => void flow.payValidation()}
            testID="sell-pay-validation"
          >
            {t("sell.validation.pay")}
          </Button>
        ) : null
      }
    >
      <ScreenTitle>{t("sell.validation.title")}</ScreenTitle>
      <Lead>{oneSatLead(t, rate.rate, profile.currency, languageTag)}</Lead>
      <View style={styles.block}>
        {view.name === "validation" ? (
          <Rows
            rows={[
              {
                label: t("sell.validation.toPay"),
                value: satsText(view.quote.amountSats, languageTag)
              },
              {
                label: t("sell.validation.fee"),
                value: satsText(view.quote.feeSats, languageTag),
                testID: "sell-validation-fee"
              }
            ]}
          />
        ) : (
          <Callout tone="warning" testID="sell-unaffordable">
            {t("sell.validation.unaffordable")}
          </Callout>
        )}
      </View>
    </Step>
  );
}

function Pending({ view }: { view: Extract<SellView, { name: "validationPending" }> }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  return (
    <>
      <ScreenTitle>{t("sell.pending.title")}</ScreenTitle>
      <Lead>{view.hasBank ? t("sell.pending.leadBank") : t("sell.pending.leadNoBank")}</Lead>
      <View style={styles.block}>
        <Rows
          rows={[
            {
              label: t("sell.pending.paid"),
              value: (
                <View style={styles.inline}>
                  <StatusPill state="open" label={t("sell.pending.badge")} sign="pulse" size="sm" />
                  <Text style={styles.value}>
                    {timeText(Math.floor(view.paidAt / 1000), languageTag)}
                  </Text>
                </View>
              ),
              testID: "sell-pending-paid"
            }
          ]}
        />
      </View>
    </>
  );
}

function Verified({ view }: { view: Extract<SellView, { name: "verified" }> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Icon name="check" size={30} color={colors.success.fg} />
        </View>
        <ScreenTitle style={styles.centred}>{t("sell.verified.title")}</ScreenTitle>
        <Lead style={styles.centred}>
          {t("sell.verified.lead", { address: view.account.cryptoAddress })}
        </Lead>
      </View>
      <View style={styles.block}>
        <Rows
          rows={[
            { label: t("sell.verified.account"), value: <Done /> },
            { label: t("sell.verified.address"), value: t("sell.verified.addressVerified") },
            {
              label: t("sell.verified.bank"),
              value: view.hasBank ? (
                <Done />
              ) : (
                <StatusPill state="open" label={t("sell.verified.bankTodo")} size="sm" />
              ),
              testID: "sell-verified-bank"
            }
          ]}
        />
      </View>
    </>
  );
}

/** A step done: its check, in the success ink. */
function Done() {
  const { colors } = useTheme();
  return <Icon name="circle-check" size={18} color={colors.success.fg} />;
}

/** A framed line: its icon, its title and what it is (the sign-up's bank step too). */
export function Item({
  icon,
  title,
  sub,
  detail
}: {
  icon: IconName;
  title: string;
  sub: string;
  detail?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.item}>
      <Icon name={icon} size={18} color={colors.text.accent} />
      <View style={styles.itemTexts}>
        <Text style={styles.itemTitle}>{title}</Text>
        {detail ? <Text style={styles.mono}>{detail}</Text> : null}
        <Text style={styles.hint}>{sub}</Text>
      </View>
    </View>
  );
}

/**
 * Step 3: a bank account typed in (AccountFormPage), in the currency proposed to begin
 * with (proposedSellCurrency); the title names it: "Where to wire your USD". No
 * account of "Settings › Bank account" to use as it is: the settings keep no bank
 * details, only the id of a Mt Pelerin account, which this step
 * never shows (it shows only while Mt Pelerin has no account a sale may go to).
 */
function BankStep() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { push } = useSellNav();
  const { profile } = usePos();
  const currency = proposedSellCurrency({
    payout: getAccountSettings()?.payoutCurrency ?? null,
    display: profile.currency,
    iban: null
  });
  return (
    <Step
      testID="sell-bank-step"
      footer={
        <Button onPress={() => push({ name: "accountForm", currency })} testID="sell-bank-add">
          {t("sell.bank.add")}
        </Button>
      }
    >
      <ScreenTitle>{t("sell.bank.title", { currency })}</ScreenTitle>
      <Lead>{t("sell.bank.lead")}</Lead>
      <View style={styles.noneRow}>
        <Icon name="circle-info" size={16} color={colors.text.secondary} />
        <Text style={styles.hint}>{t("sell.bank.none")}</Text>
      </View>
    </Step>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  fields: { gap: 8, marginTop: 22 },
  block: { marginTop: 20 },
  hint: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  centred: { textAlign: "center" },
  resend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -4
  },
  dial: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingRight: 4 },
  dialCode: { ...sans(600), fontSize: 15, color: colors.text.primary },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  value: {
    ...sans(600),
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  itemTexts: { flex: 1, gap: 3 },
  itemTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  mono: { ...mono(500), fontSize: 13, color: colors.text.primary },
  hero: { alignItems: "center", gap: 4, marginTop: 6 },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success.bg
  },
  noneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 }
}));
