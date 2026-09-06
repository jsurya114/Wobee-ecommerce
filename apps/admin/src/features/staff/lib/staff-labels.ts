import type { BadgeProps } from "@woobe/ui";
import type { StaffRole } from "@woobe/validation";
import type { StaffStatus } from "../api/admin-staff.client";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ORDER_PROCESSING_STAFF: "Order Processing",
  PRODUCT_MANAGEMENT_STAFF: "Product Management",
};

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DEACTIVATED: "Deactivated",
};

export const STAFF_STATUS_BADGE_VARIANT: Record<StaffStatus, NonNullable<BadgeProps["variant"]>> = {
  ACTIVE: "success",
  INVITED: "neutral",
  DEACTIVATED: "error",
};
