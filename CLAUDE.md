# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm install` - Install dependencies
- `npm start` - Start web development server (localhost:7474)
- `npm run mobile-start` - Start React Native Metro bundler
- `npm run android` - Run on Android (after metro is running)
- `npm run ios` - Run on iOS (requires `cd ios && pod install && cd ..` first)
- `npm run build` - Build for production web
- `npm run lint` - Run ESLint and TypeScript type checking
- `npm test` - Run Jest tests
- `npm run clean` - Clean React Native project

## Architecture Overview

### Cross-Platform React Native App
This is a React Native app with React Native Web support, enabling deployment to mobile (iOS/Android) and web from a single codebase.

### Key Technologies
- **React Native 0.77.2** with React Native Web
- **TypeScript** with strict configuration and path aliases
- **React Router** (react-router-dom for web, react-router-native for mobile)
- **Styled Components** for styling
- **i18next** for internationalization
- **Webpack** for web bundling

### Path Aliases (tsconfig.json)
```
@components → src/components
@screens → src/screens
@config → src/config
@hooks → src/hooks
@utils → src/utils
@assets → src/assets
@types → src/types
```

### App Structure
- **Root.tsx** - Nested context providers (Theme, Modal, Hardware wallet contexts)
- **App.tsx** - Main routing with React Router, error boundaries
- **src/screens/** - Main app screens (Pos, Settings, Wallet, History, etc.)
- **src/components/** - Reusable UI components with platform-specific variants
- **src/config/** - Configuration (currencies, API URLs, Bitcoin settings)

### Platform-Specific Files
Components support platform-specific implementations:
- `.tsx` - Shared
- `.native.tsx` - Mobile only
- `.ios.tsx` - iOS only
- `.android.tsx` - Android only
- `.web.tsx` - Web only

### Bitcoin Payment App Features
This is a Bitcoin point-of-sale application with:
- Hardware wallet integration (Ledger, Trezor, Bitbox via context providers)
- Bitcoin address validation and wallet derivation (BIP39/BIP84)
- Lightning Network support
- NFC/BoltCard payments
- QR code scanning/generation
- Non-custodial with auto-withdraw features

### Error Handling & Security
- Error boundaries with Sentry integration
- SSL public key pinning
- Biometric authentication
- Encrypted storage
- Screen recording prevention

## Development Notes

### Linting & Type Checking
Always run `npm run lint` which includes both ESLint and TypeScript checking (`tsc --noemit`).

### Mobile Development
For mobile development, start Metro bundler first with `npm run mobile-start`, then run platform commands in separate terminals.

### Hardware Wallet Development
Context providers for hardware wallets are pre-configured in Root.tsx. Use these existing contexts when adding hardware wallet features.