/** Narrow port for this module's one dependency on `categories` — same DIP rationale as pricing-reader.port.ts. */
export interface CategoryReaderPort {
  findIdBySlug(slug: string): Promise<string | null>;
}
