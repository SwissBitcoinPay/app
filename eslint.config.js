// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  // Formatting is Prettier's job (`npm run format:check`); disable conflicting rules.
  prettierConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", ".expo/*", "coverage/*"]
  },
  // A failure the app handles goes to its journal (src/lib/log/log.ts, logFailure), which support
  // receives ("Contact support"): never to the console alone, which production drops.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/__tests__/**", "src/lib/log/**"],
    rules: { "no-console": "error" }
  },
  // In the apps, a field of a Modal focused before that Modal is shown gets no keyboard (Android):
  // every panel's Modal is OverlayModal (src/components/ui/overlay.tsx), which tells its fields
  // when it is shown, and every field is TextField, which waits for it (AGENTS.md, hard rule 7).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Modal"],
              message: "Panels use OverlayModal (src/components/ui/overlay.tsx)."
            },
            {
              name: "react-native",
              importNames: ["TextInput"],
              message: "Fields use TextField (src/components/ui/TextField.tsx)."
            }
          ]
        }
      ],
      // react-native-web turns box-none / box-only into CSS classes only from a sheet or the
      // `pointerEvents` prop: inline, they are no CSS value, the browser drops them and keeps the
      // value before (the dock's slots stayed `none` once unlocked).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute > JSXExpressionContainer Property[key.name='pointerEvents'] Literal[value=/^box-(none|only)$/]",
          message:
            "Inline box-none / box-only is no CSS value on the web: put it in a sheet (makeStyles, StyleSheet.create) or use the pointerEvents prop."
        }
      ]
    }
  }
]);
