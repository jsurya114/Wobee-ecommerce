"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { claimGuestOrderSchema, type ClaimGuestOrderInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as ordersApi from "../api/orders.client";
import type { OrderView } from "@/features/checkout/api/checkout.client";

interface ClaimGuestOrderFormProps {
  accessToken: string;
  onClaimed: (order: OrderView) => void;
}

/**
 * "Add a guest order" (client-review fix, 2026-09-03) — the self-service
 * counterpart to checkout's confirm-email safeguard: a customer who
 * checked out as a guest (under this email or a different one than their
 * account) attaches that order here by supplying the order number from
 * their confirmation email/page plus the exact email it was placed under.
 * Kept behind a disclosure in MyOrdersList — most visitors never need it.
 */
export function ClaimGuestOrderForm({ accessToken, onClaimed }: ClaimGuestOrderFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClaimGuestOrderInput>({ resolver: zodResolver(claimGuestOrderSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const order = await ordersApi.claimGuestOrder(data, accessToken);
      toast.success(`Order ${order.orderNumber} added to your account`);
      reset();
      onClaimed(order);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0]) setError(field as keyof ClaimGuestOrderInput, { message: messages[0] });
          }
          return;
        }
        // NotFoundError (wrong order number, wrong email, or already claimed)
        // is deliberately generic server-side — surfaced as-is here too, no
        // extra guessing about which of the two fields was wrong.
        toast.error(error.status === 404 ? "No matching guest order found — check the order number and email." : error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <FormField
        label="Order number"
        placeholder="WOOBE-20260903-A1B2C3D4E5F6"
        error={errors.orderNumber?.message}
        {...register("orderNumber")}
      />
      <FormField
        label="Email used at checkout"
        type="email"
        autoComplete="email"
        error={errors.contactEmail?.message}
        {...register("contactEmail")}
      />
      <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Checking…" : "Add order"}
      </Button>
    </form>
  );
}
