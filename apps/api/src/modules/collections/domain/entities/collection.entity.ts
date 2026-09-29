export interface CollectionEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  /**
   * `findActiveCollections` (the homepage/listing) returns the RESOLVED
   * cover: the admin-uploaded `Collection.coverImageUrl` when set
   * (2026-09-29), otherwise the collection's top-sorted assigned product's
   * primary image (2026-08-31 card redesign), otherwise null. Every other
   * repository method returns the stored admin-uploaded value only (null =
   * none uploaded), which is what the admin form needs to show and clear.
   */
  coverImageUrl?: string | null;
}
