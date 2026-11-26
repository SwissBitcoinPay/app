# Card payments on iPhone with the app closed

On Android, a card pays with the app closed: the card socket wakes the app's JavaScript in the
background, which runs the card payment (src/features/card/payment.ts, the "locked" path). iOS runs
no app code in the background for a push: the same payment runs in the app's notification service
extension, which iOS runs for each card push (`mutable-content`), about 30 seconds, even with the
app closed. It is turned on by `IOS_EXTENSION_PAYS_CARDS` (`src/config/card.ts`).

## 1. What the holder gets

The same rules as Android with the account closed (payee-decision.ts, `automaticLocked`), decided
by the holder:

- **A merchant the card approved, within the card's limits and mode**: the extension pays it from
  the card's own wallet, answers the terminal, and the notification says "Card payment: 12,500
  sats", "12,500 sats to “Bakery”" (the app's notice on Android, src/features/card/card-notices.ts:
  amounts in whole sats).
- **Anything else the holder could approve** (a new merchant, the mode "Always confirm", a payee
  not identified): the notification says "Pending: Card payment", "12,500 sats to “Bakery”. Click
  to confirm, the till is waiting.". The extension
  hands the session over to the relay (`{"hold":true}`, sattleme/relay "Handing over"); touching
  the notification opens the app, which takes the session back and asks as it does in the
  foreground (passkey), within what is left of the terminal's wait.
- **What no one may approve** (a limit reached, a tap seen before, another card's tap, an invoice
  out of bounds, the card paused): refused as on Android, the terminal told why in the holder's
  language, the notification says so.
- **Anything the extension cannot prove in time** (no network, a majority of the Nostr relays not
  answering, the system's time running out): handed over, never paid, never refused on a guess.

## 2. Measurements

On an iPhone 16 (iOS 27.2.1), staging build, "iOS extension test":

|                                                                                                                              |                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Breez SDK started, synced and a payment sent, in the extension                                                               | 6.2 to 13.7 s, 10 of 10 paid, at most 4.3 MB |
| The app's own code of a payment (packet, 10 Nostr records checked and decrypted, invoice, tap, 500 hashes) in JavaScriptCore | 215 to 252 ms, +0.3 MB                       |
| The card's wallet through the engine ("enginePay": connected, synced, 1 sat paid, its preimage read)                         | 9.0 s (sync 5.3 s, send 3.6 s), 10.6 MB peak |
| Memory the system leaves the extension                                                                                       | about 165 MB                                 |
| App forced to quit, phone locked                                                                                             | runs                                         |

Not measured: an older iPhone (its memory limit may be far lower), the network steps of a real
payment (Nostr majority read, payee proof, relay session).

## 3. Architecture

```
relay push (cr, mutableContent) ──► NotificationService.swift
                                      │ card wake (data.cr), app not in front
                                      ▼
                         EngineHost.swift ── JavaScriptCore ── engine.js
                         (I/O only)                          (the app's TypeScript:
                          · random bytes, clock, timers       src/lib/engine/ + the card
                          · HTTPS fetch, WebSocket            payment's modules, *.engine.ts
                          · shared keychain and files         where React Native is needed)
                          · Breez SDK (Swift)
                          · the notification's text
```

- **One implementation of the rules.** The extension runs the app's own TypeScript, bundled
  without React Native (scripts/extension-engine.js), not a Swift copy: no second implementation
  of money rules to keep equal, no new native dependency (Nostr's secp256k1 comes from @noble, as
  in the app). Swift does only input and output.
- **The payment's rules are a core** (src/features/card/payment-core.ts) that receives as ports
  what differs between the app and the extension (CardPaymentPorts): the storage, whose writers
  differ (section 6), the card's wallet, the texts, and the account and passkey, which only the app
  has (null in the extension). The app gives it its modules (payment.ts); the engine gives it the
  host's. The network (the relay's session, the payee's proof, Nostr) and the clock are the same
  code in both, given to the engine by the host's globals and `*.engine.ts` modules. The core's
  imports reach no React Native (`src/__tests__/card-payment-core.test.ts`, which lists the modules
  still to give the engine). Android's behaviour does not change.
- **The engine's runtime**: one serial queue in the extension. Host calls are asynchronous; their
  callbacks run on that queue, and the engine's promises settle there. JavaScriptCore has no
  timers, fetch, WebSocket, AbortController, URL, atob nor TextEncoder: the host gives the first
  ones (src/lib/engine/runtime/), URL is the app's own (whatwg-url-minimum, which Expo installs in
  the app), the others are polyfills. Where the app's modules need React Native or Expo, the bundle
  takes `*.engine.ts` modules (the shared card items and files, read only; the journal) and, for
  what they use of `react-native`, `expo-constants` and `expo-file-system`, small shims
  (src/lib/engine/shims/). The host refuses any write of the app's files.
- **The wallet**: the extension opens the card's wallet with the Breez SDK's Swift binding, in its
  own storage directory in the shared container. The Breez SDK supports several instances of one
  wallet at once, each with its own storage (its docs, "Initializing the SDK"); a spend is
  co-signed by the Spark operators, so two instances cannot spend the same funds.

## 4. Who takes a wake

- **The app in front**: the app takes it (useCardWakes.ts). It writes a marker in the
  shared container while it is active; the extension that finds the marker fresh does nothing but
  the notification's title.
- **Otherwise**: the extension. A session is taken by one socket only (the relay refuses a
  second), so the app and the extension never both pay one tap.
- **Touching a notification** opens the app, which takes the packet from it: a session
  the extension handed over is taken back. A session it answered (paid, or refused once the
  invoice came) leaves no packet in its notification: the extension writes the notification's
  data without it (`{"kind": "cardPaid"}`, `{"kind": "cardWake"}`, as the app's own notices), so
  the app takes no session already answered; the payment shows in the card's history (the
  extension's payments, merged on read). A payment that ended before the invoice came (the
  session given to another socket: the app's) tells nothing and leaves the packet to the app.

## 5. The payment in the extension

```
T0  push ─► open the packet (device key) ─┬─ connect to the relay's session, wait for the invoice
                                           ├─ read the card's own copies on Nostr (majority, ≤ 4 s)
                                           ├─ read pass, states, log, payees (shared storage)
                                           └─ start the card's wallet (Breez)
invoice ─► invoice, payee proof (≤ 5 s), tap (pass: K1, K2), counter, limits ─► decision
pay      ─► log "sending" ─► send ─► {"ok":true} ─► log "sent" ─► "Paid" notice
ask      ─► {"hold":true} ─► "Tap to approve" notice ─► close the socket
refuse   ─► {"ok":false, reason} ─► "Refused" notice
```

- **Time**: iOS gives about 30 s and calls `serviceExtensionTimeWillExpire` before it ends the
  extension. The engine has 28 s of them (CardWake.swift: 2 s kept to show the outcome). A
  payment starts sending only with at least 12 s of them left (the slowest send measured took
  9.3 s); 5 s before their end (23 s), what is not decided is handed over. Without an outcome in
  time, the notification shows its title in the holder's language and keeps its packet. A send
  that has started cannot be taken back: its log entry stays "sending", counted as spent so that
  the limits never undercount (payment-log.ts), as on Android when its background task is ended.
  The entry stays "sending" in the card's history, as Android's does: neither platform settles it
  from the wallet's payments yet.
- **Nothing unproven**: the same checks and the same order as Android; a Nostr read that is not a
  majority's, a payee proof that does not answer in time, a wallet that does not start: handed
  over, never paid.
- **A tap handed over is given back** (src/lib/engine/card-states.ts): its counter, which the
  extension took as it checked the tap, goes back while it is still its last one; the app takes
  that tap once, as the relay offers its session to the app alone.
- **The outcome is told once the payment ended** (its proof read and logged, the card's wallet
  disconnected), within the extension's time (src/lib/engine/card-wake.ts).
- **After paying**: the card's next taps' hashes are deposited at the app's next sync (the
  extension's time is kept for the payment; Android deposits them after paying). No history
  record nor own copy is written by the extension: the app writes them at its next sync, as
  Android's locked path leaves them.
- **Relays of before hand-over** (no `"handOver": true` in `/v1/info`): the extension never takes
  their sessions; the notification only says "Card payment", and the app takes the payment.

## 6. Shared state

The app and the extension share an app group: a container (files) and a keychain access group.
Each file and item has **one writer**: no lock between the two processes, every write atomic
(written beside, then renamed). A reader merges.

| What                                                                                                   | Writer    | Where            | Before the move                     |
| ------------------------------------------------------------------------------------------------------ | --------- | ---------------- | ----------------------------------- |
| The device key (opens packets)                                                                         | app       | shared keychain  | app's keychain, `card-device-key`   |
| The cards' passes (iOS: while the extension pays and the card's channel holds this phone's push token) | app       | shared keychain  | Android only, `card-passes`         |
| The cards' states (keys' version, relay, last counter, limits)                                         | app       | shared keychain  | app's keychain, `card-states`       |
| The account's walletId (in the passes' item) and the device's Nostr relays                             | app       | shared keychain  | terminal profile, `nostr-relays`    |
| The payment log (limits, outcomes)                                                                     | app       | shared container | `documents/card-payments/log.json`  |
| The merchants' book                                                                                    | app       | shared container | `documents/card-payees/payees.json` |
| The extension's payments (`extension/cards/payments.json`)                                             | extension | shared container | new                                 |
| The extension's taps: each card's last counter (`extension/cards/taps.json`)                           | extension | shared container | new                                 |
| The app's "in front" marker (`card-app/front.json`)                                                    | app       | shared container | new                                 |
| The card wallets' Breez storage of the extension                                                       | extension | shared container | new                                 |

- **Moved, not copied**: on iOS, the app's own items move to the shared keychain group and
  container, once, at the first start of the version that brings this: read where they are now,
  written in the shared place, then removed from the old one; read from the old one as long as the
  new one is missing. One copy, so never a stale one. The new names are irreversible
  (AGENTS.md, "Persisted names"), each marked at its definition and locked by a test. Android
  does not change.
- **Merged on read** (src/lib/card/extension-records.ts): a card's last counter is the higher of
  the app's state and the extension's taps, read again at each tap's check (the app's copy in
  memory may predate the extension's tap); the limits count the app's log and the extension's
  payments together, each payment once (one ended over one still "sending", else the app's); the
  app takes the extension's payments into its log at its next sync, then publishes them.
- **Accessibility**: `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: readable with the phone
  locked once it was unlocked after its start, never in a backup nor on another device. A phone
  not unlocked since its start cannot read them: the extension hands over.
- **Log out** (`wipeDevice`) removes every shared item and file, the extension's included (its
  own directory, `extension/`: its journal and its card wallets' Breez storage).

## 7. Security

- **A card's pass on the iPhone** (decided by the holder's answer for automatic payments): the
  same secrets as on Android (card-pass.ts: K1, K2, the card wallet's entropy, the channel's
  secret, the own copies' secret), never the seed nor the card root. AGENTS.md's exception for the
  pass covers iOS too.
- **The extension trusts nothing it reads**: the packet, the relay's messages, the invoice, the
  payee's proof, the Nostr records are checked as in the app. Anyone with the phone's push token
  can wake the extension: a forged packet opens nothing without the device key, a replayed tap
  fails its counter, a forged tap fails K1 and K2.
- **The payment is answered only once sent**, and only within the terminal's wait, as on Android.

## 8. Limits

- **An older iPhone** may leave the extension much less memory than 165 MB: below what a
  payment needs, the extension only hands over.
- **The 30 seconds**: a slow network or a slow wallet hands over more often.
- **A send cut by the system** after it left: logged "sending", counted as spent, the terminal
  answered nothing (it times out); the 12 s rule makes it rare.
- **The app and the extension at once** (a tap while the app comes to the front): the relay's
  single session makes one of them take it; the shared counter makes a replayed tap fail in both.
