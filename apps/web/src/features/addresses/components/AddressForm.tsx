"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createAddressSchema, type CreateAddressInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { SCROLL_MARGIN_ABOVE_BOTTOM_NAV_STYLE } from "@/lib/layout-constants";
import { useAddresses } from "../hooks/useAddresses";
import type { Address } from "../api/addresses.client";

/**
 * Shared for both add and edit — edit reuses `createAddressSchema`'s field
 * shape (minus `isDefault`, which only ever changes via the dedicated
 * "Set as default" action, week2 (1).md §7) since PATCH sends every field
 * back anyway from a fully-populated form; no separate partial-update UI
 * is needed just because the API itself accepts a partial body.
 */
export function AddressForm({
  existing,
  isFirstAddress = false,
  onDone,
  onCancel,
}: {
  existing?: Address;
  /** The server always makes a customer's first-ever address the default regardless of isDefault (CreateAddressUseCase) — hide the redundant checkbox and explain instead, rather than show a control that silently does nothing. */
  isFirstAddress?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { create, update } = useAddresses();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateAddressInput>({
    resolver: zodResolver(createAddressSchema),
    defaultValues: existing
      ? {
          fullName: existing.fullName,
          phone: existing.phone,
          line1: existing.line1,
          line2: existing.line2 ?? "",
          city: existing.city,
          state: existing.state,
          pincode: existing.pincode,
          isDefault: existing.isDefault,
        }
      : { isDefault: false },
  });

  // Confirmed live (Week 2 Day 3, /account/addresses, 375×812): this form is
  // tall enough that revealing it via "Add a new address" can land its
  // submit/cancel buttons mostly BEHIND the fixed BottomNav on first paint —
  // the page's own pb-20 spacer only guarantees clearance once scrolled all
  // the way down, not on initial render, and native scrollIntoView doesn't
  // know the fixed nav is covering part of the viewport (see
  // layout-constants.ts's SCROLL_MARGIN_ABOVE_BOTTOM_NAV_STYLE doc comment
  // for the full measured repro). Actively scrolling the newly-revealed form
  // into view — respecting that scroll-margin — is the direct fix: a no-op
  // when the form already fits on screen, and otherwise brings its buttons
  // fully clear of the nav instead of leaving a half-hidden sliver.
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (existing) {
        const { isDefault: _ignored, ...fields } = data;
        await update(existing.id, fields);
      } else {
        await create(data);
      }
      toast.success(existing ? "Address updated" : "Address added");
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof CreateAddressInput, { message: messages[0] });
        }
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate style={SCROLL_MARGIN_ABOVE_BOTTOM_NAV_STYLE} className="flex flex-col gap-4">
      <FormField label="Full name" autoComplete="name" error={errors.fullName?.message} {...register("fullName")} />
      <FormField label="Phone" type="tel" autoComplete="tel" error={errors.phone?.message} {...register("phone")} />
      <FormField label="Address line 1" autoComplete="address-line1" error={errors.line1?.message} {...register("line1")} />
      <FormField
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        error={errors.line2?.message}
        {...register("line2")}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" autoComplete="address-level2" error={errors.city?.message} {...register("city")} />
        <FormField label="State" autoComplete="address-level1" error={errors.state?.message} {...register("state")} />
      </div>
      <FormField label="Pincode" inputMode="numeric" autoComplete="postal-code" error={errors.pincode?.message} {...register("pincode")} />
      {!existing && !isFirstAddress ? (
        <label className="flex items-center gap-2 font-body text-sm text-text-primary">
          <input type="checkbox" className="h-4 w-4 rounded border-border" {...register("isDefault")} />
          Set as default address
        </label>
      ) : null}
      {!existing && isFirstAddress ? (
        <p className="font-body text-xs text-text-secondary">This will be set as your default address.</p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting} className="flex-1">
          {existing ? "Save changes" : "Add address"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
