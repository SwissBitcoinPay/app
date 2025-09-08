# Swiss Bitcoin Pay app

<img alt="Swiss Bitcoin Pay" src="./docs/static/images/presentation.png" />

Swiss Bitcoin Pay is an easy-to-use solution to accept bitcoin payments in your business.

[![MIT License](https://img.shields.io/github/license/frw/react-native-ssl-public-key-pinning)](LICENSE)
![Codemagic build status](https://api.codemagic.io/apps/6580220d95d4f2f104923fef/react-native-android/status_badge.svg)
![Netlify Status](https://api.netlify.com/api/v1/badges/0537dd5e-edb6-4a7a-ada0-0f3295e50a73/deploy-status)
[![GitHub Repo stars](https://img.shields.io/github/stars/SwissBitcoinPay/app?style=social)](https://github.com/SwissBitcoinPay/app)

## 🔍 Features

- 😎 **Easy-to-use**, create account in 1 minute
- 📱 **Cross Web/iOS/Android app**
- 🕵🏻 **No KYC** identification
- 🔒 **Non-custodial** (free daily auto-withdraw to your own wallet)
- 💵 **Auto fiat conversion** (total or partial)
- 💳 [**BoltCard support**](https://github.com/boltcard/boltcard)
- 🌎 Works worldwide with most currencies
- 👥 Supports multiple employees

## 🌐 Supported languages

- 🇬🇧 English
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇮🇹 Italiano
- 🇪🇸 Español
- 🇵🇹 Português
- 🇫🇮 Suomi

## ⚙️ Tech stack

- [React](https://react.dev)
- [React Native](https://reactnative.dev)
- [React Native Web](https://necolas.github.io/react-native-web)

## 🧰 How to run

Install packages

```sh
npm install
```

### Run on web

```sh
npm start
```

Access your app at https://localhost:7474

### Run on mobile

```sh
npm run mobile-start
```

Then, in a separate terminal:

##### iOS

```sh
cd ios && pod install && cd ..
npm run ios
```

##### Android

```sh
npm run android
```

## 🤝 Contributing

- Help translate to your language on our Tolgee:
  - [Tolgee](https://tolgee.swiss-bitcoin-pay.ch/)
- PRs are welcomed! Some ideas:
  - Imagine a new cool feature to further simplify merchant's experience with bitcoin payments
  - Improve testing & security
