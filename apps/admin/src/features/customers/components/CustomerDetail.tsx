"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Button, Card } from "@woobe/ui";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminCustomer } from "../hooks/useAdminCustomer";

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { detail, loading, error, setActive } = useAdminCustomer(customerId);
  const [isToggling, setIsToggling] = useState(false);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!detail) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Customer not found.</p>;
  }

  const { customer, orders, addresses, activity } = detail;

  const toggleActive = async () => {
    setIsToggling(true);
    try {
      await setActive(!customer.isActive);
      toast.success(customer.isActive ? "Customer deactivated" : "Customer reactivated");
    } catch (error_) {
      toast.error(error_ instanceof ApiError ? error_.message : "That didn't work.");
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{customer.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={customer.isActive ? "success" : "error"}>{customer.isActive ? "active" : "deactivated"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isToggling} onClick={() => void toggleActive()}>
            {customer.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <dl className="flex flex-col gap-1 font-body text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Email</dt>
            <dd className="break-all text-right text-text-primary">{customer.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Phone</dt>
            <dd className="text-right text-text-primary">{customer.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-text-secondary">Joined</dt>
            <dd className="text-right text-text-primary">{new Date(customer.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Activity</h2>
        <dl className="flex flex-col gap-1 font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Orders placed</dt>
            <dd className="text-text-primary">{activity.orderCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Total spent</dt>
            <dd className="text-text-primary">{formatPaiseAsInr(activity.totalSpentPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Last order</dt>
            <dd className="text-text-primary">{activity.lastOrderAt ? new Date(activity.lastOrderAt).toLocaleDateString() : "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Orders</h2>
        {orders.length === 0 ? (
          <p className="font-body text-sm text-text-secondary">No orders yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 rounded-control border border-border p-2">
                <Link href={`/orders/${order.id}`} className="truncate font-body text-sm text-primary hover:underline">
                  {order.orderNumber}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-body text-xs text-text-secondary">{order.status.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="font-body text-sm text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Addresses</h2>
        {addresses.length === 0 ? (
          <p className="font-body text-sm text-text-secondary">No saved addresses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {addresses.map((address) => (
              <li key={address.id} className="rounded-control border border-border p-2 font-body text-sm text-text-primary">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{address.fullName}</span>
                  {address.isDefault ? <Badge variant="neutral">default</Badge> : null}
                </div>
                <p className="text-text-secondary">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.pincode}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
