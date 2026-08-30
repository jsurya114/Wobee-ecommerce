"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { checkoutSchema, type CheckoutInput } from "@woobe/validation";
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, RadioGroup, RadioGroupItem } from "@woobe/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import * as shippingApi from "@/features/shipping/api/shipping.client";
import type { ShippingEstimate } from "@/features/shipping/api/shipping.client";
import * as checkoutApi from "../api/checkout.client";

export function CheckoutForm() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { cart, isLoading: isCartLoading } = useCart();

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "COD" },
  });

  // week2 (1).md §10's pincode/serviceability check — informational only,
  // checked on blur so it doesn't block typing or submission itself
  // (checkPincodeServiceability is deliberately permissive today, no
  // approved restricted-area list exists yet — see that function's own
  // doc comment). Never blocks checkout; it's a courtesy heads-up.
  const [deliveryEstimate, setDeliveryEstimate] = useState<ShippingEstimate | null>(null);
  const pincodeField = register("address.pincode");
  const checkPincode = async (pincode: string) => {
    if (!pincode.trim()) {
      setDeliveryEstimate(null);
      return;
    }
    try {
      setDeliveryEstimate(await shippingApi.getShippingEstimate(pincode.trim()));
    } catch {
      // Silent — this check is a courtesy, not a validation gate; a failed
      // lookup just means no estimate shows, not a form error.
      setDeliveryEstimate(null);
    }
  };

  // Pre-fill from the account profile for a logged-in shopper — still fully
  // editable (shipping to a different person/address is a valid case).
  useEffect(() => {
    if (!user) return;
    setValue("contactEmail", user.email);
    setValue("address.fullName", user.name);
    if (user.phone) setValue("address.phone", user.phone);
  }, [user, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const order = await checkoutApi.checkout(data, accessToken ?? undefined);
      // The order lands at PENDING_PAYMENT regardless of method — the
      // confirmation page drives it the rest of the way (COD confirms
      // itself immediately; Razorpay opens Checkout and waits for the
      // webhook-verified capture, ADR-014).
      router.push(`/order-confirmation/${order.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0]) setError(field as keyof CheckoutInput, { message: messages[0] });
          }
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  if (isCartLoading) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your bag…</p>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">Your bag is empty.</p>
        <Link href="/products" className="font-body text-sm text-primary hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!cart.shipping.meetsMinimum) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">
          Your bag needs {cart.shipping.gramsToMinimum}g more to meet the minimum order weight.
        </p>
        <Link href="/cart" className="font-body text-sm text-primary hover:underline">
          Back to bag
        </Link>
      </div>
    );
  }

  const estimatedTotal =
    cart.totalPaise + (cart.shipping.isFreeDelivery ? 0 : cart.shipping.shippingFeePaise) - cart.discountPaise;

  return (
    <div className="grid gap-6 pb-4 md:grid-cols-[1fr_320px] md:gap-8 md:pb-0">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg text-text-primary">Contact</h2>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.contactEmail?.message}
            {...register("contactEmail")}
          />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-display text-lg text-text-primary">Shipping address</h2>
          <FormField
            label="Full name"
            autoComplete="name"
            error={errors.address?.fullName?.message}
            {...register("address.fullName")}
          />
          <FormField
            label="Phone"
            type="tel"
            autoComplete="tel"
            error={errors.address?.phone?.message}
            {...register("address.phone")}
          />
          <FormField
            label="Address line 1"
            autoComplete="address-line1"
            error={errors.address?.line1?.message}
            {...register("address.line1")}
          />
          <FormField
            label="Address line 2 (optional)"
            autoComplete="address-line2"
            error={errors.address?.line2?.message}
            {...register("address.line2")}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="City" autoComplete="address-level2" error={errors.address?.city?.message} {...register("address.city")} />
            <FormField
              label="State"
              autoComplete="address-level1"
              error={errors.address?.state?.message}
              {...register("address.state")}
            />
          </div>
          <FormField
            label="Pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            error={errors.address?.pincode?.message}
            {...pincodeField}
            onBlur={(e) => {
              pincodeField.onBlur(e);
              void checkPincode(e.target.value);
            }}
          />
          {deliveryEstimate ? (
            <p className={`font-body text-xs ${deliveryEstimate.serviceable ? "text-text-secondary" : "text-error"}`}>
              {deliveryEstimate.serviceable
                ? `Delivers in ${deliveryEstimate.estimatedDeliveryDaysMin}-${deliveryEstimate.estimatedDeliveryDaysMax} days`
                : deliveryEstimate.reason}
            </p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg text-text-primary">Payment method</h2>
          {/* The order always lands at PENDING_PAYMENT at checkout time; the
              confirmation page drives each method the rest of the way — see
              the onSubmit comment above. */}
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-col gap-2">
                <RadioGroupItem value="COD" label="Cash on delivery" description="Pay when your order arrives" />
                <RadioGroupItem value="RAZORPAY" label="Pay online" description="Card, UPI, or netbanking via Razorpay" />
              </RadioGroup>
            )}
          />
        </Card>

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting ? "Placing order…" : `Place order — ${formatPaiseAsInr(estimatedTotal)}`}
        </Button>
      </form>

      <Card className="h-fit p-6">
        <CardHeader className="p-0">
          <CardTitle className="mb-2">Order summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="flex flex-col gap-2 font-body text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Items ({cart.itemCount})</dt>
              <dd className="text-text-primary">{formatPaiseAsInr(cart.totalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Total weight</dt>
              <dd className="text-text-primary">{formatGrams(cart.totalWeightGrams)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Shipping</dt>
              <dd className="text-text-primary">
                {cart.shipping.isFreeDelivery ? "Free" : formatPaiseAsInr(cart.shipping.shippingFeePaise)}
              </dd>
            </div>
            {cart.discountPaise > 0 ? (
              <div className="flex justify-between">
                <dt className="text-text-secondary">Coupon discount</dt>
                <dd className="text-success">-{formatPaiseAsInr(cart.discountPaise)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex justify-between border-t border-border pt-4 font-body text-base font-medium">
            <span className="text-text-primary">Estimated total</span>
            <span className="text-text-primary">{formatPaiseAsInr(estimatedTotal)}</span>
          </div>
          <p className="mt-3 font-body text-xs text-text-secondary">
            Tax is calculated server-side and shown on your final order confirmation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
