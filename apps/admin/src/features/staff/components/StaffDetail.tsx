"use client";

import type { StaffRole } from "@woobe/validation";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { LoadingState } from "@/features/shell/components/LoadingState";
import { ApiError } from "@/lib/api-client";
import { useAdminStaff } from "../hooks/useAdminStaff";
import { STAFF_ROLE_LABELS, STAFF_STATUS_BADGE_VARIANT, STAFF_STATUS_LABELS } from "../lib/staff-labels";

export function StaffDetail({ staffId }: { staffId: string }) {
  const { user: currentUser } = useAdminAuth();
  const { staff, loading, error, changeRole, setActive, resendInvitation } = useAdminStaff(staffId);
  const [selectedRole, setSelectedRole] = useState<StaffRole | "">("");
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isResending, setIsResending] = useState(false);

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!staff) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Staff member not found.</p>;
  }

  const isSelf = currentUser?.id === staff.id;
  const roleToApply = selectedRole || staff.role;

  const submitRoleChange = async () => {
    if (roleToApply === staff.role) return;
    const confirmed = window.confirm(
      `Change ${staff.name}'s role from "${STAFF_ROLE_LABELS[staff.role]}" to "${STAFF_ROLE_LABELS[roleToApply]}"?\n\n` +
        `This immediately revokes their existing sessions — they'll need to log in again to pick up the new role.`,
    );
    if (!confirmed) return;

    setIsChangingRole(true);
    try {
      await changeRole(roleToApply);
      toast.success("Role updated");
      setSelectedRole("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change this staff member's role.");
    } finally {
      setIsChangingRole(false);
    }
  };

  const toggleActive = async () => {
    const nextActive = !staff.isActive;
    const confirmed = window.confirm(
      nextActive
        ? `Reactivate ${staff.name}? They'll be able to log in again.`
        : `Deactivate ${staff.name}? This immediately revokes their sessions — their existing login stops working right away, and any active browser session is signed out on its next request.`,
    );
    if (!confirmed) return;

    setIsTogglingActive(true);
    try {
      await setActive(nextActive);
      toast.success(nextActive ? "Staff member reactivated" : "Staff member deactivated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That didn't work.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleResendInvitation = async () => {
    setIsResending(true);
    try {
      const result = await resendInvitation();
      toast.success(result.devCode ? `Invitation resent — dev code: ${result.devCode}` : "Invitation resent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't resend the invitation.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl text-text-primary">{staff.name}</h1>
        <Badge variant={STAFF_STATUS_BADGE_VARIANT[staff.status]}>{STAFF_STATUS_LABELS[staff.status]}</Badge>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Profile</h2>
        <dl className="flex flex-col gap-1 font-body text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Email</dt>
            <dd className="break-all text-right text-text-primary">{staff.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Role</dt>
            <dd className="text-right text-text-primary">{STAFF_ROLE_LABELS[staff.role]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Last login</dt>
            <dd className="text-right text-text-primary">{staff.lastLoginAt ? new Date(staff.lastLoginAt).toLocaleString() : "Never"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Created</dt>
            <dd className="text-right text-text-primary">{new Date(staff.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Change role</h2>
        {isSelf ? (
          <p className="font-body text-sm text-text-secondary">You can't change your own role.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="New role"
              className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
              value={roleToApply}
              onChange={(e) => setSelectedRole(e.target.value as StaffRole)}
            >
              {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" isLoading={isChangingRole} disabled={roleToApply === staff.role} onClick={() => void submitRoleChange()}>
              Update role
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Access</h2>
        {isSelf ? (
          <p className="font-body text-sm text-text-secondary">You can't deactivate your own account.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
              {staff.isActive ? "Deactivate" : "Reactivate"}
            </Button>
            {staff.status === "INVITED" ? (
              <Button variant="secondary" size="sm" isLoading={isResending} onClick={() => void handleResendInvitation()}>
                Resend invitation
              </Button>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
