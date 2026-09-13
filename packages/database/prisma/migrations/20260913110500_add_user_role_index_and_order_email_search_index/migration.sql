-- Forensic review (2026-09-13): two additive index fixes, both proven from
-- actual query shapes rather than guessed.
--
-- 1. The admin customer list (auth.repository.ts) always filters
--    `role: CUSTOMER` and always sorts by `createdAt desc`, with nothing in
--    the schema backing either — every load of that page was a full
--    sequential scan of `users` plus an in-memory sort. Invisible at today's
--    row count, real once signups accumulate at the traffic this app
--    targets (10k-20k/day).
--
-- 2. The admin order search filter does
--    `contactEmail: { contains, mode: "insensitive" }` (order.repository.ts)
--    with no supporting index — `orderNumber`'s own index is a plain unique
--    btree (useful for an exact match, not a substring search). Same
--    trigram-index treatment already applied to Product.name (migration
--    20260827092111, ADR-012) for the same reason.
--
-- Both are pure additions (CREATE INDEX), no data change, no table lock
-- beyond the brief one CREATE INDEX itself takes — safe to run against a
-- live database.

-- CreateIndex
CREATE INDEX "users_role_createdAt_idx" ON "users"("role", "createdAt");

-- CreateIndex
CREATE INDEX "orders_contactEmail_trgm_idx" ON "orders" USING GIN ("contactEmail" gin_trgm_ops);
