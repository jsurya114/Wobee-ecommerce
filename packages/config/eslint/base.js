// Shared ESLint flat config — base rules for every package/app in the monorepo.
// App-specific configs (apps/web, apps/api, ...) import and extend this.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/coverage/**",
    ],
  },
  {
    // Our own *.cjs config files (eslint.config.cjs, tailwind preset, ...) are
    // plain CommonJS, not app/library TypeScript — give them Node globals and
    // allow require() instead of flagging themselves on every package's lint run.
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", exports: "writable", __dirname: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Money/weight must never be floats or unchecked `any` — see DEVELOPMENT_RULES.md #4.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
