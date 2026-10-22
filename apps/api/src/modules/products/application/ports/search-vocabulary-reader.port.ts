import type { SearchVocabularyExtras } from "../../domain/parse-search-query";

/**
 * Smart search (2026-09-29) — extra attribute values to recognise on top of
 * the built-in dictionary: the admin's own size / fabric / fit presets
 * (AppConfig, `settings` module), bound in products.module.ts. Optional for
 * callers: without one, the built-in dictionary alone is used.
 */
export interface SearchVocabularyReaderPort {
  get(): Promise<SearchVocabularyExtras>;
}
