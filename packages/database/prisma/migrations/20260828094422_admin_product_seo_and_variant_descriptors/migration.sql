-- Week 2 Day 7 (week2 (1).md §16) — admin product management additions.
--
-- The generated diff also proposed `DROP INDEX "products_name_trgm_idx"` —
-- excluded here, same as every prior migration touching this table this
-- week (Day 2/4/5): `prisma migrate diff` doesn't know about this raw-SQL
-- pg_trgm GIN index (created outside Prisma's schema DSL, migration
-- 20260827092111_add_catalogue_search_indexes) and always proposes
-- dropping it whenever anything else on `products` changes.

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "fabric" TEXT,
ADD COLUMN     "fit" TEXT,
ADD COLUMN     "measurements" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT;
