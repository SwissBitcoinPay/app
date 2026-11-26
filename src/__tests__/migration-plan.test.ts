import {
  beginMigration,
  markMigrationCreated,
  migrationBankDraft,
  migrationCreated,
  resetMigration
} from "@/features/migration/flow";
import { bankDraftOf, migrationPlan } from "@/features/migration/plan";
import type { LegacyAccountCopy } from "@/lib/legacy-v2/data";
import type { LegacyAccount, LegacyBankAccount } from "@/lib/legacy-v2/server";
import { isMerchantSettings, initialSettings, touchSettings } from "@/lib/settings/merchant";

/*
 * The sattle.me account of a v2 owner (plan.ts): its business and its payout from the v2 server,
 * else from the v2 app's copy of the account; the split and the bank account from the server only.
 * As a new merchant's sign-up: done all in bitcoin; with a share
 * in a bank, at its bank step (Mt Pelerin, then the v2 bank account prefilled); without the v2
 * share, at its split.
 */

const ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const IBAN = "CH9300762011623852957";

const copy: LegacyAccountCopy = {
  id: ID,
  name: "Lakeside Bakery",
  currency: "CHF",
  onchain: true,
  email: null
};

const bank: LegacyBankAccount = {
  iban: IBAN,
  holderName: "Carol Smith",
  address: "1 Lake Street",
  addressComplement: null,
  postalCode: "1003",
  city: "Lausanne",
  country: "CH",
  transferReference: "Till 1"
};

function account(fields: Partial<LegacyAccount> = {}): LegacyAccount {
  return {
    id: ID,
    name: "Lakeside Bakery Ltd",
    email: null,
    migratedAt: null,
    currency: "EUR",
    bankCurrency: "EUR",
    bitcoinPercent: 40,
    onchain: false,
    bank,
    localWallets: null,
    ...fields
  };
}

/** The settings of a new account with `patch` applied: valid settings of this app. */
function applied(patch: ReturnType<typeof migrationPlan>["patch"]) {
  const created = initialSettings({
    businessName: "Merchant 9EE5",
    payoutCurrency: "CHF",
    detectedCountry: "CH",
    relays: ["wss://relay.example"]
  });
  return touchSettings(created, patch);
}

describe("migrationPlan", () => {
  it("creates the account at its bank step, with the v2 server's business, share and bank account prefilled", () => {
    const plan = migrationPlan(copy, account());
    expect(plan.patch).toEqual({
      usage: "merchant",
      businessName: "Lakeside Bakery Ltd",
      displayCurrency: "EUR",
      payoutCurrency: "EUR",
      onchainPayments: false,
      bitcoinPercent: 40,
      // Never saved before Mt Pelerin has it: the bank step registers it there first.
      payoutAccountId: null,
      signUp: "bank"
    });
    expect(isMerchantSettings(applied(plan.patch))).toBe(true);
    // Every line the v2 server gave, the holder as one name, its kind to choose.
    expect(plan.bankDraft).toEqual({
      holderKind: null,
      companyName: "Carol Smith",
      firstname: "Carol",
      lastname: "Smith",
      country: "CH",
      iban: "CH93 0076 2011 6238 5295 7",
      address: "1 Lake Street",
      postalCode: "1003",
      // Its complement and transfer reference stay out: Mt Pelerin takes neither.
      city: "Lausanne"
    });
  });

  it("needs no bank account at 100 % bitcoin: the sign-up done", () => {
    const plan = migrationPlan(copy, account({ bitcoinPercent: 100 }));
    expect(plan.patch).toMatchObject({
      bitcoinPercent: 100,
      payoutAccountId: null,
      signUp: "done"
    });
    expect(plan.bankDraft).toBeNull();
    expect(isMerchantSettings(applied(plan.patch))).toBe(true);
  });

  it("asks the split without the v2 share, the v2 bank account still prefilled", () => {
    const plan = migrationPlan(copy, account({ bitcoinPercent: null }));
    expect(plan.patch).toMatchObject({
      bitcoinPercent: 100,
      payoutAccountId: null,
      signUp: "split"
    });
    expect(plan.bankDraft?.iban).toBe("CH93 0076 2011 6238 5295 7");
    expect(isMerchantSettings(applied(plan.patch))).toBe(true);
    // The v2 account not read: nothing of its payout.
    const unread = migrationPlan(copy, null);
    expect(unread.patch).toEqual({
      usage: "merchant",
      businessName: "Lakeside Bakery",
      displayCurrency: "CHF",
      payoutCurrency: "CHF",
      onchainPayments: true,
      bitcoinPercent: 100,
      payoutAccountId: null,
      signUp: "split"
    });
    expect(unread.bankDraft).toBeNull();
  });

  it("prefills what the v2 server gave of a bank account not whole, never guessing the rest", () => {
    const partial = migrationPlan(
      copy,
      account({ bank: { ...bank, city: null, holderName: null } })
    );
    expect(partial.patch).toMatchObject({
      bitcoinPercent: 40,
      payoutAccountId: null,
      signUp: "bank"
    });
    expect(partial.bankDraft).toMatchObject({
      holderKind: null,
      companyName: "",
      firstname: "",
      lastname: "",
      iban: "CH93 0076 2011 6238 5295 7",
      address: "1 Lake Street",
      city: ""
    });
    // Its IBAN alone (the v2 server's `iban_list`, without its bank account's lines).
    const ibanOnly = bankDraftOf({
      iban: IBAN,
      holderName: null,
      address: null,
      addressComplement: null,
      postalCode: null,
      city: null,
      country: null,
      transferReference: null
    });
    expect(ibanOnly).toMatchObject({ iban: "CH93 0076 2011 6238 5295 7", country: null, city: "" });
    // None: the form empty, as at any sign-up.
    expect(migrationPlan(copy, account({ bank: null })).bankDraft).toBeNull();
  });

  it("keeps the new account's own values for what is unsaid or not offered here", () => {
    const plan = migrationPlan(
      { id: ID, name: null, currency: "XOF", onchain: null, email: null },
      account({
        name: null,
        currency: "XOF",
        bankCurrency: null,
        onchain: null,
        bitcoinPercent: 100
      })
    );
    expect(plan.patch).toEqual({
      usage: "merchant",
      payoutAccountId: null,
      signUp: "done",
      bitcoinPercent: 100
    });
    // A name longer than the app takes is cut, as "Settings" cuts it.
    expect(
      migrationPlan(null, account({ name: "x".repeat(80), bitcoinPercent: 100 })).patch.businessName
    ).toHaveLength(60);
  });
});

describe("the account a migration created", () => {
  it("is the only one the migration's end screen follows, never another opened since", () => {
    resetMigration();
    const wallet = "02" + "a".repeat(64);
    expect(migrationCreated(wallet)).toBe(false);
    beginMigration({ role: "owner", account: copy, tokens: null, hasWallet: false });
    markMigrationCreated(wallet);
    expect(migrationCreated(wallet)).toBe(true);
    expect(migrationCreated("02" + "b".repeat(64))).toBe(false);
    expect(migrationCreated(null)).toBe(false);
  });

  it("hands its v2 bank account to the bank step of that account only", () => {
    resetMigration();
    const wallet = "02" + "a".repeat(64);
    beginMigration({ role: "owner", account: copy, tokens: null, hasWallet: false });
    // The v2 account not read: nothing to prefill.
    markMigrationCreated(wallet);
    expect(migrationBankDraft(wallet)).toBeNull();
    expect(migrationBankDraft("02" + "b".repeat(64))).toBeNull();
    resetMigration();
    expect(migrationBankDraft(wallet)).toBeNull();
  });
});
