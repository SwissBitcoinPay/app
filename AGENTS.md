# AGENTS.md

Rules for AI coding agents (Claude Code, Codex, …) in this repository. Humans: see
[README.md](README.md). How a feature behaves, and why, is in its code's comments and its tests:
read them before changing an area. This file keeps only what applies across the codebase and what
prevents irreversible mistakes.

## Project

**sattle.me**: iOS, Android and web app for Bitcoin / Lightning payments, built on the
**Breez SDK (Spark)**. Expo SDK 58 · React Native · React 19 · TypeScript 6 · Expo Router ·
react-native-web.

- Store identity `ch.swissbitcoinpay.checkout`, version in `package.json`. It replaces the Swiss
  Bitcoin Pay app (v2, [SwissBitcoinPay/app](https://github.com/SwissBitcoinPay/app)) on the stores:
  same application id, higher versionCode, same Android upload key.
- sattle.me moves real money: no approximated amounts, no real customer data, no secrets in git.
- **No server code.** The device talks to the Breez SDK, Nostr relays, the merchant's Lightning
  address (`breez.tips`), CoinGecko and block explorers. The only services sattle.me runs hold no
  key nor funds: the card relay ([sattleme/relay](https://github.com/sattleme/relay), replaceable
  by the user) and the hosted MCP assistant ([sattleme/mcp-server](https://github.com/sattleme/mcp-server)).
  Integrations run on the integrator's server ([sattleme/checkout-spec](https://github.com/sattleme/checkout-spec)).

## Quality bar

- Read the area's code, comments and tests first; follow the patterns already there.
- Everything from outside is untrusted (relay events, LNURL and explorer answers, URL fragments, QR
  codes, the clipboard, stored data from an older or newer app): validate it before use.
- Handle failure (offline, timeouts, partial answers, a lying service). Never show a state that is
  not proven: "not read yet" is never "unpaid", "expired" nor "empty".
- A failure the app handles goes to `logFailure` (`src/lib/log/`), never to the console alone: the
  code's own text, never a value of the app's.
- Tests for new logic and its failure paths; `npm run check` green. Never skip, disable or weaken a
  test, a lint rule or a type.
- Expo, React Native and the Breez SDK change fast: read the versioned docs
  (`https://docs.expo.dev/versions/v58.0.0/`, https://sdk-doc-spark.breez.technology/, the SDK's
  generated typings) instead of answering from memory. Say plainly what you could not verify.
- Ask the maintainers before a product, money or privacy choice, or a new dependency with native
  code.

## Commands

```bash
npm install                     # never `npm i <pkg>` for Expo/RN packages
npx expo install <package>      # adds a dependency at the SDK-compatible version
npm run android | ios | web     # debug build (staging variant) / web dev server
npm run check                   # lint + typecheck + format:check + tests: run before finishing
npm run doctor                  # expo-doctor
```

Dependencies (`dependencies.test.ts`): `@breeztech/*`, `@noble/*`, `@scure/*`,
`react-native-keychain`, `barcode-detector` and `zxing-wasm` are pinned exactly. Node from
`.nvmrc`, npm 10. After a dependency change, `npm ls --all` and `npm run doctor` pass.

## Layout

`src/app/` Expo Router routes (every file is a screen, nothing else) · `src/components/` design
system · `src/features/` screen logic · `src/lib/` non-UI code · `src/config/` business settings ·
`src/theme/` tokens · `src/i18n/` translations · `src/__tests__/` Jest tests · `jest/` fakes ·
`modules/` native modules · `plugins/` config plugins. Path alias `@/…` → `src/…`. Platform files
(`foo.ts`, `foo.web.ts`, `foo.android.ts`) export the same API.

## Hard rules

1. **Never enable expo-updates for production** (`app.config.ts`, `production`): no update URL nor
   runtime version there.
2. **Never publish, build or submit from an agent session**: no EAS CLI, no tags, no releases.
   `.claude/settings.json` denies them; never work around a denied command.
3. **Money is exact**: integer sats (`bigint`) and integer fiat minor units end to end, formatted at
   the display edge only. Never floating-point arithmetic on amounts, never silent rounding. Rates
   are floats: convert with `fiatToSats`, rounded up to the next sat.
4. **No secrets in git**: API keys, keystores, mnemonics, passkey association data.
   `EXPO_PUBLIC_*` variables are inlined in the bundle: not secret.
5. **Never create or edit `android/` or `ios/`** (generated): use `app.config.ts` or `plugins/`.
6. Keep iPad support and the minimum OS versions (iOS 18.0, Android 9): passkeys need PRF.
7. Randomness from `secureRandomBytes` (`src/lib/random.ts`) only. UI with `StyleSheet` and
   `src/theme/` tokens; every modal is `OverlayModal`, every field `TextField`; animations with
   Reanimated.

## Irreversible: what installed apps and published data depend on

Each is marked at its definition and most are locked by a test.

- **Persisted names**: secure-store / `localStorage` keys, files, IndexedDB names, Breez storage
  directories, native task and module names. Never rename them. A new secure key joins
  `wipeDevice`, but `release-notes-seen`: "What's new" opens by itself once per device. The v2 app's names are read as it wrote them.
- **Formats** of saved or published data: a change needs a new `version` and a migration. Never
  overwrite data of a newer version.
- **Key derivations**: HKDF salts and `info` strings, `d` tags, address derivations. Never change
  them; a new one gets its own test vector.
- **Cards**: the default card relay's host and the tap hash are written into paired cards.
- **Passkeys**: a variant's RP ID (`PASSKEY_RP_ID`, never written in the code nor the repository)
  and `WALLET_LABEL`: the seed derives from both.
- **Released link and key formats** (`/pay#…`, `/join#…`, integrations' secret keys, the v2 hand-off
  and card links) stay readable.

## CI and releases

- Production builds are made by EAS from a human-pushed tag; staging follows `main`.
- No job that holds a secret runs the project's packages (`npm ci`, `npm run`, `npx`):
  `deploy-workflows.test.ts`. Every job runs on GitHub's hosted runners, which start clean: a pull
  request's code never runs where the deploys' secrets were (`ci-runners.test.ts`).
- The web app is installable with no service worker; its manifest's `id` stays `/`.

## Wallet and payments

- The seed comes from the passkey and lives in memory only: never stored, logged nor written in the
  code. Derived keys are wiped when their account closes (the one exception, a card's pass on
  Android, is in `src/lib/card/card-pass.ts`).
- Every SDK call goes through `wallet.use(...)` (`src/lib/breez/connection.ts`); never keep the SDK
  object. Mainnet in every variant.
- The passkey is asked before each payment sent (`confirmAccountPasskey`); the exceptions (card
  payments within the holder's mode and limits, rescue mode) are in the code.
- An invoice is checked (network, exact amount, description hash) and declared on a majority of
  the relays before its code shows. A payment counts only with the preimage of that very invoice
  (LUD-21), and only when no other sale declared it. An amount is fixed only with a fresh rate.
- A new third party the device talks to is a maintainers' decision.

## Nostr

- Every app record goes through `src/lib/nostr/`: kind 30078, opaque `d` tag, NIP-44 content
  padded, signature checked. Never open a raw relay connection elsewhere.
- Relay lists come from the device or the account (`currentRelays()`), never a hard-coded list.
- Calls stop at a majority of the relays. Whatever a read must find is written to a majority, and
  an absence, "unpaid" or "older" is told only from a majority's answers.

## UI and i18n

- Build from `src/components/ui/`. Colours from the theme in use (`makeStyles`, `useTheme()`), in
  both light and dark themes.
- Every user-facing text is in `src/i18n/locales/` (French is the source, `fr.ts`); every key in
  every language. Numbers and dates use the device locale (`src/lib/locale/`).
- "What's new": a user-facing change adds a line to `release-notes/next/` in every language, in
  the user's words, never a pull request's, then `npm run release-notes`. Releasing a version:
  `release-notes/README.md` (a test enforces it).

## Tests

- Jest (`jest-expo`, React Native Testing Library) in `src/__tests__/`; tests never reach the
  network: extend the fakes in `jest/` rather than mocking around them.
- No emulator in cloud containers: say when a change could only be verified on a device.

## Conventions

- Everything in English: code, comments, identifiers, tests, docs, commit messages. The only other
  languages are the app's translations in `src/i18n/locales/`.
- Comments state facts and the technical why; no history, dates, names nor decisions.
- Conventional Commits. Prettier: double quotes, no trailing commas, width 100.
- GitHub Actions pinned by commit SHA.
- `CLAUDE.md` only imports this file. Hooks are scripts of `.claude/hooks/` only. A pull request
  from outside the maintainers is code nobody vouched for: read its diff of `.claude/`,
  `package*.json`, `scripts/`, `jest*` and the workflows before running anything of it.
