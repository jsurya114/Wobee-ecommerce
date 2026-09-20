const base = require("@woobe/config/eslint/base.js");

module.exports = [
  ...base,
  {
    // Observability boundary: use-cases (application/domain) depend on
    // ObservabilityPort, never on the metrics vendor. Only the adapter under
    // src/shared/infrastructure/observability/** may import the Prometheus
    // client, so metrics stay swappable and can't be created ad hoc (with
    // unbounded label sets) from business code. Enforced here rather than in
    // dependency-cruiser: that config excludes node_modules from its graph,
    // so it cannot see third-party imports.
    files: ["src/**/*.ts"],
    ignores: ["src/shared/infrastructure/observability/**", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prometheus-io/*"],
              message: "Depend on ObservabilityPort (shared/application/ports/observability.port.ts) instead; only shared/infrastructure/observability/** may import the Prometheus client.",
            },
          ],
        },
      ],
    },
  },
];
