import { prisma } from "@woobe/database";
import { NotFoundError } from "../../../../shared/errors";
import type { AddressFields, AddressRepositoryPort } from "../../application/ports/address-repository.port";
import type { AddressEntity } from "../../domain/entities/address.entity";

const SELECT_FIELDS = {
  id: true,
  userId: true,
  fullName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  pincode: true,
  isDefault: true,
  createdAt: true,
} as const;

/**
 * ADR-010: the ONLY file in the users module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs). Owns
 * `Address` — genuinely new territory, not previously written by any
 * other module (Week 1's checkout deliberately left `Order.addressId`
 * null and never touched this table — see journal.md's Day 4 entry).
 *
 * Authorization (week2 (1).md §7 — "Users access only their own
 * addresses"): every read/write method takes userId as a required
 * parameter and scopes its query by BOTH id and userId together, the same
 * mechanism WishlistRepository already established for wishlist items — an
 * addressId belonging to a different account simply doesn't match, rather
 * than needing a separate ownership check layered on top.
 */
export class AddressRepository implements AddressRepositoryPort {
  async findAllForUser(userId: string): Promise<AddressEntity[]> {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: SELECT_FIELDS,
    });
  }

  async findByIdForUser(userId: string, addressId: string): Promise<AddressEntity | null> {
    return prisma.address.findFirst({ where: { id: addressId, userId }, select: SELECT_FIELDS });
  }

  async countForUser(userId: string): Promise<number> {
    return prisma.address.count({ where: { userId } });
  }

  async create(userId: string, fields: AddressFields, isDefault: boolean): Promise<AddressEntity> {
    if (!isDefault) {
      return prisma.address.create({ data: { userId, ...fields, isDefault: false }, select: SELECT_FIELDS });
    }
    // New default: clear every other address's isDefault in the same
    // transaction, so two rows are never simultaneously "the" default.
    const [, created] = await prisma.$transaction([
      prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      prisma.address.create({ data: { userId, ...fields, isDefault: true }, select: SELECT_FIELDS }),
    ]);
    return created;
  }

  async update(userId: string, addressId: string, fields: Partial<AddressFields>): Promise<AddressEntity> {
    // updateMany, not update-by-id — the WHERE clause is the authorization
    // check (id AND userId together); a plain update-by-id would 500 on a
    // Prisma-level type mismatch risk of trusting an unscoped id. count===0
    // means either the address doesn't exist or belongs to someone else —
    // both correctly surface as 404, not a raw 500 or a silent no-op.
    const result = await prisma.address.updateMany({ where: { id: addressId, userId }, data: fields });
    if (result.count === 0) {
      throw new NotFoundError("Address not found");
    }
    const updated = await prisma.address.findUnique({ where: { id: addressId }, select: SELECT_FIELDS });
    if (!updated) {
      // Can only happen if the row was deleted by a concurrent request
      // between the updateMany above and this read — astronomically
      // unlikely for a single user's own address book, surfaced honestly
      // rather than silently returning a stale/undefined shape.
      throw new NotFoundError("Address not found");
    }
    return updated;
  }

  async deleteAndListRemaining(userId: string, addressId: string): Promise<{ id: string; createdAt: Date }[]> {
    const [deleted] = await prisma.$transaction([
      prisma.address.deleteMany({ where: { id: addressId, userId } }),
      // Read runs in the same transaction as the delete so "remaining" is a
      // consistent snapshot, not racy against a concurrent create/delete on
      // this same user's address book between the two statements.
    ]);
    if (deleted.count === 0) {
      throw new NotFoundError("Address not found");
    }
    return prisma.address.findMany({ where: { userId }, select: { id: true, createdAt: true } });
  }

  async setDefault(userId: string, addressId: string): Promise<AddressEntity> {
    const target = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!target) {
      throw new NotFoundError("Address not found");
    }
    const [, updated] = await prisma.$transaction([
      prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      prisma.address.update({ where: { id: addressId }, data: { isDefault: true }, select: SELECT_FIELDS }),
    ]);
    return updated;
  }
}
