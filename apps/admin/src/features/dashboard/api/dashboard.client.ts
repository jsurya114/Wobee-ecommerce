import type { BusinessDashboard, DashboardCompare, DashboardRange } from "@woobe/types";
import { apiFetch } from "@/lib/api-client";

export type { BusinessDashboard } from "@woobe/types";

/** What the toolbar controls. `from`/`to` (inclusive IST dates, YYYY-MM-DD) matter only for `custom`. */
export interface DashboardSelection {
  range: DashboardRange;
  compare: DashboardCompare;
  from?: string;
  to?: string;
}

/** VIEW_ANALYTICS-gated (super_admin only — see apps/api's permissions.ts). One request drives every panel. */
export function getDashboard(selection: DashboardSelection, accessToken: string): Promise<BusinessDashboard> {
  const params = new URLSearchParams({ range: selection.range, compare: selection.compare });
  if (selection.range === "custom" && selection.from && selection.to) {
    params.set("from", selection.from);
    params.set("to", selection.to);
  }
  return apiFetch<BusinessDashboard>(`/api/v1/admin/analytics/dashboard?${params.toString()}`, { accessToken });
}
