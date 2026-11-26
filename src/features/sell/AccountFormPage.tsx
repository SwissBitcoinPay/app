import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Lead } from "@/components/ui/Heading";
import type { SellCurrency } from "@/config/mtpelerin";
import { getAccountSettings } from "@/features/account/session";
import { BankDetailsFields } from "@/features/bank/BankDetailsFields";
import { bankHolderOf, emptyBankDetails, type BankDetails } from "@/features/bank/bank-details";
import { bankDetailsOfAccount } from "@/features/settings/payout-accounts";
import { usePos } from "@/features/terminal/pos";
import {
  bankAccountChange,
  newBankAccount,
  type BankAccountInput,
  type BankOwnerInput
} from "@/lib/mtpelerin/accounts";
import { isSellCurrency, proposedSellCurrency } from "@/lib/mtpelerin/sale";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";

import { PayoutCurrencyField } from "./CurrencyField";
import { Failure, SellBody } from "./parts";
import { useSellNav } from "./SellSheet";

/*
 * "Add an account", a page of "Sell"'s panel: a bank
 * account where Mt Pelerin wires the sales, always the merchant's own (`user_is_owner:
 * true`, a company's included, as Mt Pelerin confirmed). Its fields are the app's own
 * (BankDetailsFields, as the sign-up's and the settings'): the holder, a person or a company, the
 * IBAN, the address that goes with each transfer; then the currency (PayoutCurrencyField), the
 * one proposed (proposedSellCurrency) or the bank step's. Added, the panel goes back to the page
 * under it (the step's next, the accounts). No note above the button.
 * The same IBAN in the same currency is not added twice (flow.ts `accountKnown`). What is typed
 * goes to Mt Pelerin only: the app keeps none of it.
 *
 * `editing` ("Edit the account"): an account
 * of "Bank accounts", its holder and address as Mt Pelerin has them, to change (flow.ts
 * `updateBankAccount`); its IBAN and currency shown, not changed: another one is another account,
 * which the lead says. Saved only once something changed.
 */
export function AccountFormPage({
  currency: chosen,
  editing = null
}: {
  /** The bank step's currency, to begin with. */
  currency: SellCurrency | null;
  editing?: MtpBankAccount | null;
}) {
  const { t } = useTranslation();
  const { flow, state, pop, pickCountry } = useSellNav();
  const { profile } = usePos();
  const [details, setDetails] = useState<BankDetails>(() =>
    editing ? bankDetailsOfAccount(editing, null) : emptyBankDetails()
  );
  const [currency, setCurrency] = useState<SellCurrency>(
    () =>
      (editing && isSellCurrency(editing.currency) ? editing.currency : null) ??
      chosen ??
      proposedSellCurrency({
        payout: getAccountSettings()?.payoutCurrency ?? null,
        display: profile.currency,
        iban: null
      })
  );
  const busy = state.busy === (editing ? "savingAccount" : "addingAccount");
  const holder = bankHolderOf(details);
  const owner: BankOwnerInput | null = holder
    ? {
        holder,
        street: details.address,
        postcode: details.postalCode,
        city: details.city,
        country: details.country
      }
    : null;
  const input: BankAccountInput | null = owner ? { ...owner, iban: details.iban, currency } : null;
  const complete = editing
    ? owner !== null && bankAccountChange(editing, owner) !== null
    : input !== null && newBankAccount(input) !== null;
  // A failure of the page under it (another account's change, the step's) is not this form's: it
  // goes as the form opens, unless a call still runs.
  useEffect(() => {
    const opened = flow.getState();
    if (opened.busy === null && opened.failure !== null) flow.dismissFailure();
  }, [flow]);
  const update = (patch: Partial<BankDetails>) =>
    setDetails((current) => ({ ...current, ...patch }));

  // Refused, the failure stays under the form.
  const submit = async () => {
    const done = editing
      ? owner !== null && (await flow.updateBankAccount(editing, owner))
      : input !== null && (await flow.addBankAccount(input));
    if (done) pop();
  };

  return (
    <SellBody
      footer={
        <Button
          disabled={!complete}
          loading={busy}
          onPress={() => void submit()}
          testID="sell-account-submit"
        >
          {t(editing ? "sell.accountEdit.submit" : "sell.accountForm.submit")}
        </Button>
      }
      testID={editing ? "sell-account-edit" : "sell-account-form"}
    >
      {editing ? <Lead style={styles.lead}>{t("sell.accountEdit.lead")}</Lead> : null}
      <View style={styles.fields}>
        <BankDetailsFields
          value={details}
          onChange={update}
          disabled={busy}
          ibanLocked={editing !== null}
          onPickCountry={() =>
            pickCountry({
              title: t("bank.country"),
              value: details.country,
              onSelect: (country) => update({ country })
            })
          }
          testID="sell-account"
        />
        {editing && !isSellCurrency(editing.currency) ? null : (
          <PayoutCurrencyField
            value={currency}
            onChange={setCurrency}
            disabled={busy || editing !== null}
            testID="sell-account-currency"
          />
        )}
      </View>
      {state.failure ? <Failure failure={state.failure} testID="sell-account-failure" /> : null}
    </SellBody>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: 0 },
  fields: { gap: 10 }
});
