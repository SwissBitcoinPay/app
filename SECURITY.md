# Security

sattle.me holds its users' wallets behind their passkeys, and takes payments for merchants. A flaw
that could move or block someone's funds, expose a passkey, a seed or a key derived from it, forge a
payment or an invoice, or read a merchant's or their clients' data: please report it **privately**,
never in a public issue, pull request or discussion.

## How to report

- On GitHub: **Security** tab of this repository → **Report a vulnerability** (private
  vulnerability reporting).
- Or by email: security@sattle.me, subject starting with `[security] app`.

Please include what you found, the platform (iOS, Android, web) and the app's version, and, when you
can, the steps or the input that show it. Do not test against real users' funds, keys or data.

We read reports in English. To encrypt an email, use the OpenPGP key of
security@sattle.me: [`public/.well-known/pgp-key.txt`](public/.well-known/pgp-key.txt), also served as
`/.well-known/pgp-key.txt`. Its fingerprint:
`578E F7BE 4E02 1431 1E63  C02A AFC1 E621 FAEF 5193`.

The same contact is served as [`/.well-known/security.txt`](public/.well-known/security.txt)
(RFC 9116) by the web app.

## What is in scope

- The iOS, Android and web app built from this repository, and its release workflows.

## Not in scope

- The services the app talks to (the Breez SDK, Nostr relays, LNURL servers, block explorers…):
  they belong to their operators.

## What to expect

We will give you our assessment of your report within 10 days.

Please give us the time to fix and release before you disclose anything: we will agree on a date
with you, and credit you when the fix is published, unless you prefer otherwise. There is no reward
programme.
