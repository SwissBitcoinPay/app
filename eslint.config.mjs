import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import moduleResolver from "eslint-plugin-module-resolver";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default [
  {
    ignores: [
      "**/webpack.config.ts",
      "**/react-native.config.js",
      "**/metro.config.js",
      "**/jest.config.js",
      "**/index.js",
      "**/babel.config.js",
      "**/.eslintrc.js"
    ]
  },
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "@react-native",
      "plugin:@typescript-eslint/recommended",
      "plugin:@typescript-eslint/recommended-requiring-type-checking",
      "plugin:react/recommended",
      "plugin:react-hooks/recommended",
      "prettier"
    )
  ),
  {
    plugins: {
      "@typescript-eslint": fixupPluginRules(typescriptEslint),
      "module-resolver": moduleResolver
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        tsconfigRootDir: "/home/swiss-bitcoin-pay/sbp/app",
        project: ["./tsconfig.json"]
      }
    },

    settings: {
      react: {
        version: "detect"
      },

      "import/resolver": {
        "babel-module": {}
      }
    },

    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/display-name": "off",
      "react-native/no-inline-styles": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": ["warn"],
      radix: "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],

      "no-void": [
        "error",
        {
          allowAsStatement: true
        }
      ],

      "no-console": [
        "error",
        {
          allow: ["error", "warn"]
        }
      ]
    }
  }
];
