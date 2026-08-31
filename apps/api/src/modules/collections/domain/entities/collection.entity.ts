export interface CollectionEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  /**
   * 2026-08-31 (card redesign) — the collection's own top-sorted assigned
   * product's primary image, or null if it has none assigned. There is no
   * `Collection` media field (checked before adding this) — real product
   * photography only, never invented art. Only populated by
   * `findActiveCollections`; every other repository method omits it
   * (`undefined`), since a text-only admin list/edit view has no use for it.
   */
  coverImageUrl?: string | null;
}
