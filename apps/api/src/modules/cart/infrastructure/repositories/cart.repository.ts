import { CartStatus, prisma } from "@woobe/database";
import type { CartItemRecord, CartRecord, CartRepositoryPort } from "../../application/ports/cart-repository.port";

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

  async createCart(params: { userId?: string }): Promise<CartRecord> {
    const cart = await prisma.cart.create({ data: { userId: params.userId } });
    return toRecord(cart);
  }

  async markCartMerged(cartId: string): Promise<void> {
    await prisma.cart.update({ where: { id: cartId }, data: { status: CartStatus.MERGED } });
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

  async removeItem(itemId: string): Promise<void> {
    await prisma.cartItem.delete({ where: { id: itemId } });
  }
}

function toRecord(cart: { id: string; userId: string | null; status: CartStatus }): CartRecord {
  return { id: cart.id, userId: cart.userId, status: cart.status };
}

function toItemRecord(row: { id: string; cartId: string; variantId: string; quantity: number }): CartItemRecord {
  return { id: row.id, cartId: row.cartId, variantId: row.variantId, quantity: row.quantity };
}
