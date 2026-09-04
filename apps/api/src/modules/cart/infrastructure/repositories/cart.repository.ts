import { CartStatus, Prisma, prisma } from "@woobe/database";
import type { CartItemRecord, CartRecord, CartRepositoryPort } from "../../application/ports/cart-repository.port";

/** The only shape `markCartConverted`'s opaque `tx` handle is ever cast to — see that method's own comment on the port. */
type PrismaTx = Prisma.TransactionClient;

/**
 * ADR-010: the ONLY file in the cart module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs). Owns
 * Cart/CartItem only — variant/pricing/inventory data comes through this
 * module's other ports, never a direct Prisma query here.
 */
export class CartRepository implements CartRepositoryPort {
  async findActiveCartByUserId(userId: string): Promise<CartRecord | null> {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    return cart && cart.status === CartStatus.ACTIVE ? toRecord(cart) : null;
  }

  async findActiveCartById(cartId: string): Promise<CartRecord | null> {
    const cart = await prisma.cart.findUnique({ where: { id: cartId } });
    return cart && cart.status === CartStatus.ACTIVE ? toRecord(cart) : null;
  }

  async findCartByUserId(userId: string): Promise<CartRecord | null> {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    return cart ? toRecord(cart) : null;
  }

  async createCart(params: { userId?: string }): Promise<CartRecord> {
    const cart = await prisma.cart.create({ data: { userId: params.userId } });
    return toRecord(cart);
  }

  async reactivateCart(cartId: string): Promise<CartRecord> {
    // Clear first: the old items already live on the completed order's
    // snapshot (OrderItem), not meant to reappear in the reactivated cart.
    // couponCode is cleared for the same reason — a code applied to the
    // cart that just checked out has no bearing on a brand-new session.
    await prisma.cartItem.deleteMany({ where: { cartId } });
    const cart = await prisma.cart.update({ where: { id: cartId }, data: { status: CartStatus.ACTIVE, couponCode: null } });
    return toRecord(cart);
  }

  async markCartMerged(cartId: string): Promise<void> {
    await prisma.cart.update({ where: { id: cartId }, data: { status: CartStatus.MERGED } });
  }

  async markCartConverted(cartId: string, tx: unknown): Promise<void> {
    const client = tx as PrismaTx;
    // couponCode cleared here too (belt-and-suspenders with reactivateCart's
    // own clear) — a CONVERTED cart is done, its coupon already redeemed
    // (CouponRedemption row, not this field) and must not silently carry
    // forward to whatever cart this user has next.
    await client.cart.update({ where: { id: cartId }, data: { status: CartStatus.CONVERTED, couponCode: null } });
  }

  async lockCartForCheckout(cartId: string, tx: unknown): Promise<CartRecord | null> {
    const client = tx as PrismaTx;
    // Same `$queryRaw ... FOR UPDATE` pattern as inventory's own
    // lockRowsForVariants — Prisma's query builder has no FOR UPDATE clause.
    const rows = await client.$queryRaw<{ id: string; userId: string | null; status: CartStatus }[]>`
      SELECT "id", "userId", "status"
      FROM "carts"
      WHERE "id" = ${cartId}
      FOR UPDATE
    `;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findItems(cartId: string): Promise<CartItemRecord[]> {
    const rows = await prisma.cartItem.findMany({ where: { cartId }, orderBy: { createdAt: "asc" } });
    return rows.map(toItemRecord);
  }

  async findItem(cartId: string, itemId: string): Promise<CartItemRecord | null> {
    const row = await prisma.cartItem.findUnique({ where: { id: itemId } });
    return row && row.cartId === cartId ? toItemRecord(row) : null;
  }

  async findItemByVariant(cartId: string, variantId: string): Promise<CartItemRecord | null> {
    const row = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
    return row ? toItemRecord(row) : null;
  }

  async addItem(cartId: string, variantId: string, quantity: number): Promise<CartItemRecord> {
    const row = await prisma.cartItem.create({ data: { cartId, variantId, quantity } });
    return toItemRecord(row);
  }

  async setItemQuantity(itemId: string, quantity: number): Promise<CartItemRecord> {
    const row = await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return toItemRecord(row);
  }

  async setItemVariant(itemId: string, variantId: string): Promise<CartItemRecord> {
    const row = await prisma.cartItem.update({ where: { id: itemId }, data: { variantId } });
    return toItemRecord(row);
  }

  async removeItem(itemId: string): Promise<void> {
    await prisma.cartItem.delete({ where: { id: itemId } });
  }

  async findCouponCode(cartId: string): Promise<string | null> {
    const cart = await prisma.cart.findUnique({ where: { id: cartId }, select: { couponCode: true } });
    return cart?.couponCode ?? null;
  }

  async setCouponCode(cartId: string, code: string | null): Promise<void> {
    await prisma.cart.update({ where: { id: cartId }, data: { couponCode: code } });
  }
}

function toRecord(cart: { id: string; userId: string | null; status: CartStatus }): CartRecord {
  return { id: cart.id, userId: cart.userId, status: cart.status };
}

function toItemRecord(row: { id: string; cartId: string; variantId: string; quantity: number }): CartItemRecord {
  return { id: row.id, cartId: row.cartId, variantId: row.variantId, quantity: row.quantity };
}
