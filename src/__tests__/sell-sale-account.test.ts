import { closeAccount } from "@/features/account/session";
import type { SellReady } from "@/features/sell/flow";
import { saleAccount } from "@/features/sell/SalePage";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";

import { openMerchantAccount } from "../../jest/account";
import { fakeIban } from "../../jest/mtpelerin-fake/server";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The bank account a sale goes to (saleAccount, SalePage.tsx): the one chosen, else the one
 * "Settings › Bank account" chose (its Mt Pelerin id, all the settings keep of it), else the
 * first in the settings' payout currency, else the first. The split's sale goes there too
 * (SplitSale.tsx). Fictitious data only.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const IBAN = fakeIban(5101);
const OTHER_IBAN = fakeIban(5102);

function account(id: string, iban: string, currency: string): MtpBankAccount {
  return {
    kind: "bank",
    id,
    status: "active",
    iban,
    currency,
    label: null,
    owner: {
      name: { kind: "company", name: "Example Studio" },
      street: "1 Example Street",
      postcode: "1000",
      city: "Lausanne",
      country: "CH"
    }
  };
}

const ready = (accounts: MtpBankAccount[]) => ({ accounts }) as unknown as SellReady;

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
});

afterEach(() => {
  closeAccount();
});

describe("saleAccount", () => {
  it("is the settings' account (its Mt Pelerin id), whichever Mt Pelerin lists first", async () => {
    await openMerchantAccount({
      bitcoinPercent: 60,
      payoutCurrency: "EUR",
      payoutAccountId: "eur"
    });
    const accounts = [
      account("other", OTHER_IBAN, "EUR"),
      account("chf", IBAN, "CHF"),
      account("eur", IBAN, "EUR")
    ];

    expect(saleAccount(ready(accounts), null).id).toBe("eur");
    // The one chosen comes first.
    expect(saleAccount(ready(accounts), "chf").id).toBe("chf");
  });

  it("is the first in the payout currency without the settings' account (format 17's), else the first", async () => {
    await openMerchantAccount({ bitcoinPercent: 60, payoutCurrency: "EUR", payoutAccountId: null });
    const accounts = [account("chf", IBAN, "CHF"), account("eur", OTHER_IBAN, "EUR")];
    expect(saleAccount(ready(accounts), null).id).toBe("eur");

    // The settings' account no longer at Mt Pelerin: the same.
    closeAccount();
    await openMerchantAccount({
      bitcoinPercent: 60,
      payoutCurrency: "EUR",
      payoutAccountId: "removed"
    });
    expect(saleAccount(ready(accounts), null).id).toBe("eur");
    expect(saleAccount(ready([account("chf", IBAN, "CHF")]), null).id).toBe("chf");
  });
});
