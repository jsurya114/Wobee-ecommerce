const base = require("@woobe/config/eslint/base.js");

module.exports = [
  ...base,
  { ignores: ["generated/**"] },
  {
    // CLI script, not request-handling code — console output is the point,
    // not a leak risk (DEVELOPMENT_RULES.md #8 is about business-logic logging).
    files: ["prisma/seed.ts"],
    rules: { "no-console": "off" },
  },
];
