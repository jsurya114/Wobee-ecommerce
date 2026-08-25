const base = require("./base.js");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...base,
  {
    rules: {
      // ADR-019: apps/web and apps/admin never talk to Postgres directly.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@woobe/database", "@woobe/database/*", "@prisma/client"],
              message:
                "Frontend apps never import packages/database (ADR-019). Go through apps/api over HTTP instead.",
            },
          ],
        },
      ],
    },
  },
];
