import type { AddressEntity } from "../../domain/entities/address.entity";

export interface AddressFields {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1). Every method is scoped by userId — the
 * authorization mechanism (see AddressRepository's own doc comment), same
 * shape as WishlistRepositoryPort's wishlistId scoping.
 */
export interface AddressRepositoryPort {
  findAllForUser(userId: string): Promise<AddressEntity[]>;
  findByIdForUser(userId: string, addressId: string): Promise<AddressEntity | null>;
  countForUser(userId: string): Promise<number>;
  create(userId: string, fields: AddressFields, isDefault: boolean): Promise<AddressEntity>;
  update(userId: string, addressId: string, fields: Partial<AddressFields>): Promise<AddressEntity>;
  /** Deletes and returns the ids/createdAt of every address still remaining for this user afterward (input to `selectPromotedDefault`), in one transaction — see AddressRepository's own comment. */
  deleteAndListRemaining(userId: string, addressId: string): Promise<{ id: string; createdAt: Date }[]>;
  /** Sets `addressId` as the sole default for this user; clears every other address's isDefault in the same transaction. */
  setDefault(userId: string, addressId: string): Promise<AddressEntity>;
}
