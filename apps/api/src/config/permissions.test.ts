import { describe, expect, it } from "vitest";
import { PERMISSIONS, roleHasPermission } from "./permissions";

describe("roleHasPermission (ADR-024)", () => {
  it("customer has no admin permissions — storefront only", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(roleHasPermission("CUSTOMER", permission)).toBe(false);
    }
  });

  it("super_admin has every permission", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(roleHasPermission("SUPER_ADMIN", permission)).toBe(true);
    }
  });

  it("order_processing_staff and product_management_staff have disjoint permission sets — neither is a subset of the other", () => {
    expect(roleHasPermission("ORDER_PROCESSING_STAFF", PERMISSIONS.MANAGE_ORDERS)).toBe(true);
    expect(roleHasPermission("ORDER_PROCESSING_STAFF", PERMISSIONS.MANAGE_CATALOG)).toBe(false);
    expect(roleHasPermission("ORDER_PROCESSING_STAFF", PERMISSIONS.MANAGE_SETTINGS)).toBe(false);

    expect(roleHasPermission("PRODUCT_MANAGEMENT_STAFF", PERMISSIONS.MANAGE_CATALOG)).toBe(true);
    expect(roleHasPermission("PRODUCT_MANAGEMENT_STAFF", PERMISSIONS.MANAGE_INVENTORY)).toBe(true);
    expect(roleHasPermission("PRODUCT_MANAGEMENT_STAFF", PERMISSIONS.MANAGE_ORDERS)).toBe(false);
    expect(roleHasPermission("PRODUCT_MANAGEMENT_STAFF", PERMISSIONS.MANAGE_SETTINGS)).toBe(false);
  });

  it("only super_admin can manage settings or staff", () => {
    expect(roleHasPermission("SUPER_ADMIN", PERMISSIONS.MANAGE_STAFF)).toBe(true);
    expect(roleHasPermission("ORDER_PROCESSING_STAFF", PERMISSIONS.MANAGE_STAFF)).toBe(false);
    expect(roleHasPermission("PRODUCT_MANAGEMENT_STAFF", PERMISSIONS.MANAGE_STAFF)).toBe(false);
  });
});
