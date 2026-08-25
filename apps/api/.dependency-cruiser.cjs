/**
 * ADR-010: module boundary enforcement, checked in CI (not just convention).
 * `pnpm --filter @woobe/api run boundaries:check` runs this against src/.
 *
 * This currently enforces the one rule explicitly required by ADR-010: only
 * a module's own infrastructure/ files may import Prisma (@woobe/database /
 * @prisma/client). If a module is later extracted into its own service,
 * this is the seam — no cross-module direct DB access to untangle.
 *
 * NOT attempted here: a general "module A can't reach into module B's
 * domain/infrastructure internals" rule. dependency-cruiser's `from`/`to`
 * path regexes aren't correlated with backreferences (a `to.pathNot` can't
 * refer back to what `from.path` captured), so a same-module
 * application -> domain import (normal, required by architecture.md §3.1)
 * can't be distinguished from a cross-module one without either a rule per
 * module pair or a custom validator function. Revisit with one of those if
 * cross-module reach-ins become a real problem — don't re-add a
 * backreference-based rule, it silently no-ops or false-positives.
 */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module-database-access",
      comment:
        "ADR-010: only <module>/infrastructure/** may import @woobe/database or @prisma/client.",
      severity: "error",
      // Scoped to apps/api's own src/ so this doesn't also (mis)flag edges
      // entirely inside packages/database itself (e.g. its generated client's
      // internal requires) — those aren't part of this app's module system.
      // Exemptions: src/server.ts calls prisma.$disconnect() during graceful
      // shutdown only, never queries a model (bootstrap, not a module); test
      // files legitimately need direct DB access for fixture setup/teardown
      // — they're validating the system as a whole, not part of the
      // module's own runtime call graph.
      from: {
        path: "^src/",
        pathNot: "^(src/modules/[^/]+/infrastructure/|src/server\\.ts$)|\\.test\\.ts$",
      },
      // dependency-cruiser matches `to.path` against the RESOLVED path, not the
      // import specifier — @woobe/database resolves through the pnpm workspace
      // symlink to packages/database/src/**, and @prisma/client resolves into
      // its node_modules dir. Matched unanchored so it doesn't care whether the
      // resolved path is relative (../../packages/...) or absolute.
      to: { path: "packages/database/(src|generated)/|node_modules/@prisma/client/" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: "node_modules",
    doNotFollow: { path: "node_modules" },
  },
};
