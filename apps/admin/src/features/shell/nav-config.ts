import type { Permission } from "@woobe/types";

export interface AdminNavEntry {
  label: string;
  href: string;
  status: "live" | "coming-soon";
  permission: Permission;
}

/**
 * Every planned admin section, in one place. A staff member only ever
 * sees entries their role has permission for (see Sidebar.tsx); a
 * `coming-soon` entry renders disabled with a badge rather than being
 * hidden, so the shape of what's coming is visible now. Next week's work
 * is: build the feature folder, add the route, flip one line here — not
 * touch this file's structure or Sidebar/TopBar at all.
 */
export const ADMIN_NAV: AdminNavEntry[] = [
  { label: "Customers", href: "/customers", status: "live", permission: "MANAGE_CUSTOMERS" },
  { label: "Products", href: "/products", status: "live", permission: "MANAGE_CATALOG" },
  { label: "Collections", href: "/collections", status: "live", permission: "MANAGE_CATALOG" },
  { label: "Banners", href: "/banners", status: "live", permission: "MANAGE_CATALOG" },
  { label: "Orders", href: "/orders", status: "live", permission: "MANAGE_ORDERS" },
  { label: "Inventory", href: "/inventory", status: "live", permission: "MANAGE_INVENTORY" },
  { label: "Staff", href: "/staff", status: "coming-soon", permission: "MANAGE_STAFF" },
  { label: "Returns", href: "/returns", status: "live", permission: "MANAGE_ORDERS" },
  { label: "Settings", href: "/settings", status: "coming-soon", permission: "MANAGE_SETTINGS" },
];

/** Mirrors apps/api/src/config/permissions.ts's ROLE_PERMISSIONS map — duplicated here (client-side convenience only, never the actual enforcement) rather than imported, since apps/admin can't reach into apps/api's internals (ADR-019). The server route guard is what actually enforces access; this only decides what to show. */
export const ROLE_PERMISSIONS: Record<string, ReadonlySet<Permission>> = {
  CUSTOMER: new Set(),
  SUPER_ADMIN: new Set(["MANAGE_SETTINGS", "MANAGE_CATALOG", "MANAGE_INVENTORY", "MANAGE_ORDERS", "MANAGE_STAFF", "MANAGE_CUSTOMERS"]),
  ORDER_PROCESSING_STAFF: new Set(["MANAGE_ORDERS"]),
  PRODUCT_MANAGEMENT_STAFF: new Set(["MANAGE_CATALOG", "MANAGE_INVENTORY"]),
};

export function navEntriesForRole(role: string): AdminNavEntry[] {
  const permissions = ROLE_PERMISSIONS[role] ?? new Set();
  return ADMIN_NAV.filter((entry) => permissions.has(entry.permission));
}

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role ?? "CUSTOMER"] ?? new Set()).has(permission);
}
