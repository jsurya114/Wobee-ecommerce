/** Narrow port for this module's one dependency on `collections` — same DIP rationale as category-reader.port.ts. */
export interface CollectionReaderPort {
  findIdBySlug(slug: string): Promise<string | null>;
}
