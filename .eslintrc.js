module.exports = {
  settings: {
    react: {
      version: "detect" // React version. "detect" automatically picks the version you have installed.
    },
    "import/resolver": {
      "babel-module": {}
    }
  },
  extends: [
    "eslint:recommended",
    "@react-native",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  rules: {
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-misused-promises": "off",
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
    "no-void": ["error", { allowAsStatement: true }],
    "no-console": ["error", { allow: ["error", "warn"] }]
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"]
  },
  ignorePatterns: [
    "webpack.config.ts",
    "react-native.config.js",
    "metro.config.js",
    "jest.config.js",
    "index.js",
    "babel.config.js",
    ".eslintrc.js"
  ],
  plugins: ["@typescript-eslint", "module-resolver"],
  root: true
};
