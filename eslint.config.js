const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(REVIVE_COOLDOWN_MS|MAX_GUARD)$",
        },
      ],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-control-regex": "off",
    },
  },
  {
    ignores: ["node_modules/**", "coverage/**", "logs/**"],
  },
];
