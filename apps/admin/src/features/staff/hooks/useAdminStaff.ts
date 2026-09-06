"use client";

import type { StaffRole } from "@woobe/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as staffApi from "../api/admin-staff.client";
import type { AdminStaffSummary } from "../api/admin-staff.client";

export function staffDetailQueryKey(staffId: string) {
  return ["admin", "staff", "detail", staffId] as const;
}

export function useAdminStaff(staffId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: staffDetailQueryKey(staffId),
    queryFn: () => withFreshToken((token) => staffApi.getStaff(staffId, token)),
  });

  const applyUpdate = (result: { staff: AdminStaffSummary }) => {
    queryClient.setQueryData<{ staff: AdminStaffSummary }>(staffDetailQueryKey(staffId), result);
    void queryClient.invalidateQueries({ queryKey: ["admin", "staff", "list"] });
  };

  const changeRoleMutation = useMutation({
    mutationFn: (role: StaffRole) => withFreshToken((token) => staffApi.changeStaffRole(staffId, { role }, token)),
    onSuccess: applyUpdate,
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => staffApi.setStaffActive(staffId, { isActive }, token)),
    onSuccess: applyUpdate,
  });

  const resendInvitationMutation = useMutation({
    mutationFn: () => withFreshToken((token) => staffApi.resendStaffInvitation(staffId, token)),
  });

  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Couldn't load this staff member.") : null;

  return {
    staff: query.data?.staff ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    changeRole: (role: StaffRole) => changeRoleMutation.mutateAsync(role),
    setActive: (isActive: boolean) => setActiveMutation.mutateAsync(isActive),
    resendInvitation: () => resendInvitationMutation.mutateAsync(),
  };
}
