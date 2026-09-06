import { apiFetch } from "@/lib/api-client";

/** Public, pre-auth — no accessToken; the invited staff member has no session yet (see StaffActivationController's own comment on the API side). */
export function verifyStaffInvitation(input: { email: string; code: string }): Promise<void> {
  return apiFetch(`/api/v1/staff/activate/verify`, { method: "POST", body: input });
}

export function activateStaff(input: { email: string; code: string; password: string }): Promise<void> {
  return apiFetch(`/api/v1/staff/activate`, { method: "POST", body: input });
}
