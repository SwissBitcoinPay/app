import "@/i18n";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { migrationPlan } from "@/features/migration/plan";
import { MigrationAccountCard } from "@/features/migration/MigrationAccountCard";

/*
 * The v2 account's card (src/app/migration/index.tsx): never a payout before the v2 server said it,
 * and, once read, only what the new account takes.
 */

describe("the v2 account's card", () => {
  it("says the v2 app's currency, and nothing of the payouts, before the v2 server answers", async () => {
    await render(
      <MigrationAccountCard
        name="Lakeside Bakery"
        email={null}
        currency="CHF"
        payouts={{ kind: "reading" }}
      />
    );
    expect(screen.getByTestId("migration-confirm-currency")).toHaveTextContent(/CHF/);
    expect(screen.getByTestId("migration-confirm-pending")).toHaveTextContent(/Reading…/);
    expect(screen.queryByTestId("migration-confirm-split")).toBeNull();
    expect(screen.queryByTestId("migration-confirm-iban")).toBeNull();
  });

  it("says the password reads the payouts when the session does not", async () => {
    await render(
      <MigrationAccountCard
        name={null}
        email="carol@example.com"
        currency={null}
        payouts={{ kind: "password" }}
      />
    );
    expect(screen.getByTestId("migration-confirm-pending")).toHaveTextContent(
      /After your password/
    );
    expect(screen.queryByTestId("migration-confirm-currency")).toBeNull();
  });

  it("shows, once read, the currency the new account takes, never one it left out", async () => {
    await render(
      <MigrationAccountCard
        name="Lakeside Bakery"
        email={null}
        currency="XAF"
        payouts={{
          kind: "read",
          plan: {
            patch: {
              usage: "merchant",
              bitcoinPercent: 100,
              payoutAccountId: null,
              signUp: "done"
            },
            bankDraft: null
          }
        }}
      />
    );
    expect(screen.getByTestId("migration-confirm-split")).toHaveTextContent(/100\s?%\sbitcoin/);
    expect(screen.queryByTestId("migration-confirm-currency")).toBeNull();
    expect(screen.queryByTestId("migration-confirm-pending")).toBeNull();
  });

  it("shows the v2 bank account read, prefilled at the bank step, even when not whole", async () => {
    await render(
      <MigrationAccountCard
        name="Lakeside Bakery"
        email={null}
        currency="CHF"
        payouts={{
          kind: "read",
          plan: migrationPlan(null, {
            id: "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
            name: "Lakeside Bakery",
            email: null,
            migratedAt: null,
            currency: "CHF",
            bankCurrency: "CHF",
            bitcoinPercent: 40,
            onchain: true,
            // The city missing: shown all the same, the form asks it.
            bank: {
              iban: "CH9300762011623852957",
              holderName: "Carol Smith",
              address: "1 Lake Street",
              addressComplement: null,
              postalCode: "1003",
              city: null,
              country: "CH",
              transferReference: null
            },
            localWallets: null
          })
        }}
      />
    );
    expect(screen.getByTestId("migration-confirm-split")).toHaveTextContent(
      /40\s?%\sbitcoin · 60\s?%\sbank/
    );
    expect(screen.getByTestId("migration-confirm-iban")).toHaveTextContent(/CH93 •••• 2957/);
    // In Plus Jakarta Sans, as the card's other values.
    expect(StyleSheet.flatten(screen.getByText(/CH93 •••• 2957/).props.style).fontFamily).toMatch(
      /^PlusJakartaSans-/
    );
    expect(screen.getByTestId("migration-confirm-holder")).toHaveTextContent(/Carol Smith$/);
  });
});
