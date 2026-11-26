# Integrations

An **integration** lets an online shop, or any server, charge its customers into a sattle.me
merchant's wallet. Everything runs on the integrator's own server: sattle.me runs no API.

The protocol, its conformance vectors and the porting guide are in
**[sattleme/checkout-spec](https://github.com/sattleme/checkout-spec)**. That repository is the
reference; this page only gives the overview.

## How it works

1. In the app, the merchant opens **Integrations › Create an integration**, picks a shop platform
   or a language, and gets a **secret key** (`sattleme_ck_…`), shown once. They give it to the
   integrator.
2. With that key alone, the integrator's server:
   - reads the integration's channel on the merchant's Nostr relays (the Lightning address, the
     payment registry, the relays);
   - asks the merchant's Lightning address for an invoice for each order, and checks it;
   - declares the invoice in the merchant's registry, on a majority of the relays;
   - gives the invoice to its checkout page;
   - verifies the payment (LUD-21 preimage) and marks the order paid.
3. The customer's browser only receives the invoice: no key, no Lightning address, no relay.
   Optionally, the server can instead send the customer to a **checkout link** on the web app's
   `/pay` page, which shows the invoice, proves its payment and returns the customer to the shop.
4. The merchant sees the integration's sales in the app. **Remove the integration** in the app,
   and its key creates no more invoices.

Small amounts are paid in Lightning only; larger ones in Lightning or on-chain, from deposit
addresses the merchant gives the integration.

## Packages

| Language | Package                                                                      |
| -------- | ---------------------------------------------------------------------------- |
| Node.js  | [`@sattleme/checkout`](https://www.npmjs.com/package/@sattleme/checkout)     |
| Python   | [`sattleme-checkout`](https://pypi.org/project/sattleme-checkout/)           |
| PHP      | [`sattleme/checkout`](https://packagist.org/packages/sattleme/checkout)      |
| Java     | [`me.sattle:checkout`](https://maven.sattle.me/)                             |
| .NET     | [`Sattleme.Checkout`](https://www.nuget.org/packages/Sattleme.Checkout)      |
| Ruby     | [`sattleme-checkout`](https://rubygems.org/gems/sattleme-checkout)           |
| Rust     | [`sattleme-checkout`](https://crates.io/crates/sattleme-checkout)            |
| Go       | [`github.com/sattleme/checkout-go`](https://github.com/sattleme/checkout-go) |

Each package's README is its documentation. The list the app offers is
`src/config/integration-catalog.ts`.

## Security

- The secret key gives what the integration needs and nothing more: it can create and verify
  invoices for the merchant, never spend from the wallet.
- Keep the key on the server, never in a browser or a mobile app.
- A payment counts only with the preimage of that very invoice's hash, and only when no other sale
  declared it.
