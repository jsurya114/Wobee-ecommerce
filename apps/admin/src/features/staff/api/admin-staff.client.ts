import type { ChangeStaffRoleInput, CreateStaffInput, ListStaffQuery, SetStaffActiveInput, StaffRole } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export type StaffStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export interface AdminStaffSummary {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  status: StaffStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

function toQuery(params: ListStaffQuery): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  return query.toString();
}

export function listStaff(params: ListStaffQuery, accessToken: string): Promise<{ items: AdminStaffSummary[] }> {
  return apiFetch(`/api/v1/admin/staff?${toQuery(params)}`, { accessToken });
}

export function getStaff(id: string, accessToken: string): Promise<{ staff: AdminStaffSummary }> {
  return apiFetch(`/api/v1/admin/staff/${id}`, { accessToken });
}

export function createStaff(
  input: CreateStaffInput,
  accessToken: string,
): Promise<{ staff: AdminStaffSummary; invitationExpiresAt: string; devCode?: string }> {
  return apiFetch(`/api/v1/admin/staff`, { method: "POST", body: input, accessToken });
}

export function changeStaffRole(id: string, input: ChangeStaffRoleInput, accessToken: string): Promise<{ staff: AdminStaffSummary }> {
  return apiFetch(`/api/v1/admin/staff/${id}/role`, { method: "PATCH", body: input, accessToken });
}

export function setStaffActive(id: string, input: SetStaffActiveInput, accessToken: string): Promise<{ staff: AdminStaffSummary }> {
  return apiFetch(`/api/v1/admin/staff/${id}/active`, { method: "POST", body: input, accessToken });
}

export function resendStaffInvitation(id: string, accessToken: string): Promise<{ pending: true; expiresAt: string; devCode?: string }> {
  return apiFetch(`/api/v1/admin/staff/${id}/invitation/resend`, { method: "POST", accessToken });
}
