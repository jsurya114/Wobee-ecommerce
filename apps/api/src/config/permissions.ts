import type { Permission, Role } from "@woobe/types";

/**
 * ADR-024: permissions mapped to roles, not hardcoded per-role checks —
 * adding a role later (e.g. the deliberately-not-built-now `accountant`
 * role) is a config change here, not a rebuild of every route guard.
 */
export const PERMISSIONS = {
  /** GST slabs, default ₹/kg rate, shipping thresholds/fee (ADR-023) — super_admin only. */
  MANAGE_SETTINGS: "MANAGE_SETTINGS",
  /** Product creation/editing, images, categories, per-product ₹/kg override, weight, measurements, stock/SKU. */
  MANAGE_CATALOG: "MANAGE_CATALOG",
  /** Stock/SKU levels — product_management_staff's side of inventory (distinct from checkout's reservation locking, ADR-015). */
  MANAGE_INVENTORY: "MANAGE_INVENTORY",
  /** Order confirmation, packing, shipping, tracking, cancellations, returns/refunds. */
  MANAGE_ORDERS: "MANAGE_ORDERS",
  /** Staff account/role management — super_admin only. */
  MANAGE_STAFF: "MANAGE_STAFF",
  /** Week 2 Day 7 (week2 (1).md §19) — customer list/detail/account-status. super_admin only: neither staff role's own quotation description (plan.md §3) mentions customer-account access, and this is exactly the kind of PII-adjacent surface not worth quietly widening an existing staff grant for. */
  MANAGE_CUSTOMERS: "MANAGE_CUSTOMERS",
  /** Admin analytics dashboard (2026-09-03) — revenue, order/customer counts, best sellers. super_admin only, same reasoning as MANAGE_CUSTOMERS: revenue figures are more sensitive than either staff role's own day-to-day scope (order processing, catalog/inventory), and neither role's quotation description mentions business reporting. */
  VIEW_ANALYTICS: "VIEW_ANALYTICS",
} as const;

/**
 * ADR-024: NOT a linear hierarchy — order_processing_staff and
 * product_management_staff have disjoint permission sets, neither is a
 * subset of the other. `customer` gets no admin permissions at all
 * (storefront only).
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  CUSTOMER: new Set(),
  SUPER_ADMIN: new Set([
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.MANAGE_CATALOG,
    PERMISSIONS.MANAGE_INVENTORY,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.MANAGE_STAFF,
    PERMISSIONS.MANAGE_CUSTOMERS,
    PERMISSIONS.VIEW_ANALYTICS,
  ]),
  // Explicitly no catalog/pricing/settings access (ADR-024).
  ORDER_PROCESSING_STAFF: new Set([PERMISSIONS.MANAGE_ORDERS]),
  // Explicitly no order/payment access, no business settings (ADR-024).
  PRODUCT_MANAGEMENT_STAFF: new Set([PERMISSIONS.MANAGE_CATALOG, PERMISSIONS.MANAGE_INVENTORY]),
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
