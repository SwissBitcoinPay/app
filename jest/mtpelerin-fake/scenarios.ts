import { FakeMtPelerin, fakeConfig, fakeIban } from "./server";

/*
 * The tests' scenarios (jest/mtpelerin.ts, `startScenario`): a fake Mt Pelerin (server.ts) in the
 * state each one names, to go through every step of "Sell" without Mt Pelerin. What a number
 * finds is seeded at its first login, whatever number is typed: the merchant's Lightning address,
 * given, names the accounts seeded as theirs. Fictitious data only.
 */

export const SCENARIOS = [
  /** No Mt Pelerin profile: every step. */
  "newCustomer",
  /** A profile found by its number, without anything else ("the profile and its accounts"). */
  "existingProfile",
  /** A profile, its Lightning address another profile's: 409 "Duplicate account". */
  "addressTaken",
  /** Its Lightning account paid and waiting for Mt Pelerin's sync. */
  "validationPending",
  /** Its Lightning address proven, no bank account yet. */
  "noBank",
  /** Everything a sale needs: the address proven, a bank account in CHF. */
  "ready",
  /** Ready, with 420.01 CHF sold this month (Mt Pelerin's limits). */
  "readyWithSales",
  /** The configuration lists no Lightning asset: no sale offered. */
  "lightningNotOffered"
] as const;

export type Scenario = (typeof SCENARIOS)[number];

/** The fictitious bank account of the scenarios: "Example Studio", in CHF. */
export const SCENARIO_IBAN = fakeIban(2957);

/** A fake Mt Pelerin in the state of `scenario`, for the merchant of `lightningAddress`. */
export function scenarioServer(scenario: Scenario, lightningAddress: string): FakeMtPelerin {
  const server = new FakeMtPelerin();
  const lightning = (status: "active" | "pending_validation") => ({
    type: "lightning",
    bank_code: "BTC",
    bank_name: "Lightning",
    currency: "BTC",
    crypto_address: lightningAddress,
    verification_code: "4821",
    user_is_owner: true,
    status
  });
  const bank = {
    type: "external",
    reference: "Example Studio",
    iban: SCENARIO_IBAN,
    currency: "CHF",
    owner_companyname: "Example Studio",
    owner_street: "1 Example Street",
    owner_postcode: "1000",
    owner_city: "Lausanne",
    owner_country: "CH",
    user_is_owner: true,
    status: "active"
  };
  const seed = (fill?: (phone: string) => void) => {
    server.onNewPhone = (phone) => {
      server.seedProfile(phone);
      fill?.(phone);
    };
  };
  switch (scenario) {
    case "newCustomer":
      break;
    case "existingProfile":
      seed();
      break;
    case "addressTaken":
      seed();
      server.seedOtherProfileAccount(lightning("active"));
      break;
    case "validationPending":
      seed((phone) => server.seedAccount(phone, lightning("pending_validation")));
      break;
    case "noBank":
      seed((phone) => server.seedAccount(phone, lightning("active")));
      break;
    case "ready":
      seed((phone) => {
        server.seedAccount(phone, lightning("active"));
        server.seedAccount(phone, bank);
      });
      break;
    case "readyWithSales":
      seed((phone) => {
        server.seedAccount(phone, lightning("active"));
        server.seedAccount(phone, bank);
        // 498 117 sats at 84 318 CHF the BTC: 420.01 CHF counted (fees included, the centime
        // rounded up), sold now: this month's whenever the test runs.
        server.seedSale(phone, { sats: 498_117n, at: server.now() });
      });
      break;
    case "lightningNotOffered": {
      seed();
      const config = fakeConfig();
      server.config = {
        ...config,
        networks: (config.networks as { id: string }[]).filter(
          ({ id }) => id !== "lightning_mainnet"
        )
      };
      break;
    }
  }
  return server;
}
