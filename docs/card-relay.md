# Card relay

A sattle.me BoltCard pays from its holder's **phone**, at any point of sale that accepts BoltCards
(LUD-03). The point of sale only talks to the relay whose address is written into the card; the
relay wakes the phone, which checks the tap, reads the invoice, applies the card's limits and pays
from the card's own wallet.

The relay's code and its full contract (version 2) are in
**[sattleme/relay](https://github.com/sattleme/relay)**. The default relay is `relay.sattle.me`
(`DEFAULT_CARD_RELAY_HOST`, `src/config/card.ts`); a holder can pair a card with their own relay
instead, in the card's **Advanced settings**.

## What the relay never holds

The relay holds **no key and no funds**. It never receives the card's keys (K0 to K4), the
wallet's seed nor the card's UID, and it cannot forge a valid tap nor read what it carries:

- each card's keys are derived on the phone (`src/lib/card/keys.ts`);
- the phone deposits only hashes of the taps to come, so that the relay can route a tap to its
  card's channel and refuse a tap presented twice;
- each channel's secret is derived from the card and the relay's host: it is worth nothing on
  another relay;
- push tokens reach the relay sealed.

## A payment

1. The point of sale reads the card (`lnurlw://<relay>/w?p=…&c=…`) and calls the relay, which
   answers a LUD-03 `withdrawRequest` and wakes the phone (a push notification, or on Android the
   card socket's permanent connection). The relay writes no text: on Android the app writes the
   notification; on iPhone, the notification service extension
   (`plugins/card-notification-extension/`, docs/ios-card-payments.md) takes the payment with the
   app closed and writes the notification in the app's language before iOS shows it; a build
   without it shows the relay's title, `sattle.me`.
2. The point of sale sends its invoice to the relay's callback; the relay hands it to the phone.
3. The phone checks the tap (`p` decrypted with K1, `c` with K2, a counter strictly above the last
   one seen), the invoice (network, amount, expiry), the card's limits and its holder's mode, then
   pays or declines (`src/features/card/payment.ts`).
4. The relay passes the phone's answer back to the point of sale.

The app refuses a relay that does not announce protocol version 2 (`GET /v1/info`). The app's side
of the contract is in `src/lib/card/` (`relay-client.ts`, `relay-session.ts`, `wake-packet.ts`) and
its tests use a fake relay (`jest/card-relay.ts`).
