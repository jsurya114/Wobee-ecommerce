-- AlterTable
ALTER TABLE "app_config" ADD COLUMN     "budgetTiles" JSONB NOT NULL DEFAULT '[{"label":"Under ₹499","maxPricePaise":49900,"coverImageUrl":null},{"label":"Under ₹799","maxPricePaise":79900,"coverImageUrl":null},{"label":"Under ₹999","maxPricePaise":99900,"coverImageUrl":null}]';
