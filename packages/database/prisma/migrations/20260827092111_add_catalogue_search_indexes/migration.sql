-- Week 2 Day 1 (ADR-012): catalogue search/filter indexes.
--
-- pg_trgm + a GIN trigram index on products.name is part of ADR-012's own
-- "at launch" decision (not the OpenSearch/Meilisearch trigger, which is a
-- separate, higher bar this catalogue doesn't meet yet). Written as raw SQL
-- because Prisma's schema DSL has no first-class syntax for a non-btree
-- operator-class index — the `@@index` additions below (minPricePaiseCache,
-- createdAt) go through the normal generated DDL instead.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_minPricePaiseCache_idx" ON "products"("minPricePaiseCache");

-- CreateIndex
CREATE INDEX "products_createdAt_idx" ON "products"("createdAt");
