"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatGrams, formatPaiseAsInr } from "@woobe/utils";
import { checkoutSchema, type CheckoutInput } from "@woobe/validation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  RadioGroup,
  RadioGroupItem,
} from "@woobe/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as addressesApi from "@/features/addresses/api/addresses.client";
import type { Address } from "@/features/addresses/api/addresses.client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCart } from "@/features/cart/hooks/useCart";
import * as shippingApi from "@/features/shipping/api/shipping.client";
import type { ShippingEstimate } from "@/features/shipping/api/shipping.client";
import * as checkoutApi from "../api/checkout.client";
import { CheckoutAddressPicker } from "./CheckoutAddressPicker";
import { OrderPlacementCelebration } from "./OrderPlacementCelebration";

export function CheckoutForm() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { cart, isLoading: isCartLoading, refresh: refreshCart } = useCart();

  const {
    register,
    handleSubmit,
    control,
    watch,
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
  const [deliveryEstimate, setDeliveryEstimate] =
    useState<ShippingEstimate | null>(null);

  // Bug fix (2026-09-09): checkout's own success path awaits `refreshCart()`
  // before navigating (see onSubmit below) so the app-root nav badge is
  // already correct by the time the confirmation page mounts — but that
  // `setCart` happens while THIS component is still mounted on /checkout,
  // and the render guards below ("Your bag is empty" / weight threshold)
  // read that same cart state. Without this flag, the now-emptied cart
  // makes this component render its own empty-bag branch for the beat
  // between the refresh resolving and `router.push` completing the route
  // change — a real race, not a guess: the order already placed
  // successfully, the cart is *supposed* to be empty now, this component
  // just shouldn't be the one reacting to that. `orderPlaced` scopes
  // "ignore what cart state says, we know why it's empty" to this one
  // component's own checkout flow, so the shared cart guards stay honest
  // for every other case (a shopper who genuinely has an empty bag still
  // sees them normally) — see journal.md 2026-09-05 for the refresh fix
  // this complements.
  const [orderPlaced, setOrderPlaced] = useState(false);
  // The just-placed order's id, captured purely for navigation once the
  // celebration finishes — never re-derived from cart/checkout state, and
  // never passed into the (untouched) confirmation page as props; that
  // page still fetches its own data by id exactly as before.
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  // `refreshCart()` still runs (and is still awaited before navigating) for
  // the exact reason the 2026-09-09 fix documented below — the nav badge
  // must be correct by the time the confirmation page mounts. What changed
  // (2026-09-12, order-placement celebration) is *when* the navigation
  // itself fires: previously immediately after this promise resolved, now
  // only once BOTH this has resolved AND the celebration animation's own
  // timeline has finished — whichever takes longer — so a fast cart
  // refresh can never cut the animation short.
  const cartRefreshRef = useRef<Promise<void> | null>(null);
  const pincodeField = register("address.pincode");
  const checkPincode = async (pincode: string) => {
    if (!pincode.trim()) {
      setDeliveryEstimate(null);
      return;
    }
    try {
      setDeliveryEstimate(
        await shippingApi.getShippingEstimate(pincode.trim()),
      );
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

  // Week 3 Day 2 — saved-address selection. The backend has had full
  // Address CRUD (account/addresses) since Week 2; checkout never offered
  // picking one, so a logged-in shopper had to retype their address every
  // time. Read-only fetch here (no AddressesProvider — that Context is
  // deliberately scoped to the address-book page only, see its own doc
  // comment; checkout only ever needs to READ the list once). Selecting one
  // still just fills the same editable fields below — it never bypasses
  // server-side snapshotting (checkout always re-sends the full address as
  // typed, exactly as before this change).
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | "new">(
    "new",
  );
  useEffect(() => {
    if (!user || !accessToken) {
      setSavedAddresses([]);
      return;
    }
    let cancelled = false;
    void addressesApi.listAddresses(accessToken).then((result) => {
      if (cancelled) return;
      setSavedAddresses(result.addresses);
      const preferred =
        result.addresses.find((a) => a.isDefault) ?? result.addresses[0];
      if (preferred) applySavedAddress(preferred);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySavedAddress is stable (closes only over setValue); re-running per its identity would refetch on every keystroke.
  }, [user, accessToken]);

  function applySavedAddress(address: Address): void {
    setSelectedAddressId(address.id);
    setValue("address.fullName", address.fullName);
    setValue("address.phone", address.phone);
    setValue("address.line1", address.line1);
    setValue("address.line2", address.line2 ?? "");
    setValue("address.city", address.city);
    setValue("address.state", address.state);
    setValue("address.pincode", address.pincode);
    void checkPincode(address.pincode);
  }

  // "Add a new address" (CheckoutAddressPicker) — clears the editable fields
  // back to a fresh entry, same starting point a shopper with zero saved
  // addresses already gets (name/phone pre-filled from the account, same as
  // the effect above; everything address-specific blank) rather than leaving
  // whichever saved address's values happened to be filled in already.
  function resetToFreshAddress(): void {
    setSelectedAddressId("new");
    setValue("address.fullName", user?.name ?? "");
    setValue("address.phone", user?.phone ?? "");
    setValue("address.line1", "");
    setValue("address.line2", "");
    setValue("address.city", "");
    setValue("address.state", "");
    setValue("address.pincode", "");
    setDeliveryEstimate(null);
  }

  const onSubmit = handleSubmit(async (data) => {
    try {
      const order = await checkoutApi.checkout(data, accessToken ?? undefined);
      // Order already placed successfully server-side — from this point on,
      // this component's own empty-cart/weight guards must stop reading
      // cart state (see the flag's doc comment above) regardless of what
      // `refreshCart` below is about to do to it.
      setPlacedOrderId(order.id);
      setOrderPlaced(true);
      // CheckoutUseCase converts the cart server-side inside the same
      // transaction as order creation (unconditional — happens regardless
      // of payment method, since that's a separate concern from "is this
      // cart's job done"), but that response never reaches CartProvider's
      // own `setCart` (checkout is a distinct API call, not one of the
      // cart context's own mutation methods) — without this, the nav
      // badge/cart page would keep showing the pre-checkout snapshot until
      // a full page reload remounted the provider. `refreshCart` re-fetches
      // the now-authoritative (converted/empty) cart from the server, the
      // same "ask the backend, don't guess" rule every other cart mutation
      // already follows. Kicked off here (not awaited inline) so the
      // order-placement celebration can start rendering immediately rather
      // than waiting on this network round trip; `handleCelebrationComplete`
      // below still awaits it before navigating, preserving the original
      // guarantee that the nav badge is correct by the time the
      // confirmation page mounts. Errors are swallowed rather than blocking
      // navigation to an order that was already placed successfully — the
      // next real page load resolves it regardless.
      cartRefreshRef.current = refreshCart().catch(() => {});
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0])
              setError(field as keyof CheckoutInput, { message: messages[0] });
          }
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  // Fires once `OrderPlacementCelebration`'s own fixed animation timeline
  // finishes. Still waits on the cart refresh kicked off in `onSubmit`
  // above (a no-op await in the near-certain case it already settled
  // during the ~2s animation) before navigating — this is the only place
  // that actually calls `router.push` for a successful checkout now.
  const handleCelebrationComplete = useCallback(() => {
    if (!placedOrderId) return;
    void (cartRefreshRef.current ?? Promise.resolve()).then(() => {
      router.push(`/order-confirmation/${placedOrderId}`);
    });
  }, [placedOrderId, router]);

  if (isCartLoading) {
    return (
      <p className="py-16 text-center font-body text-sm text-text-secondary">
        Loading your bag…
      </p>
    );
  }

  // Order placed — the cart legitimately just went empty (or stale) as a
  // side effect of `refreshCart()` above, on this very page, mid-navigation
  // to the confirmation route. Render a transitional state instead of
  // falling into the empty-bag/weight guards below, which would otherwise
  // misread "checkout just succeeded" as "this shopper's bag is empty."
  // (2026-09-12: this transitional state is now the order-placement
  // celebration rather than a plain "Redirecting…" line — same guard,
  // richer transition. `placedOrderId` is always set in the same tick as
  // `orderPlaced`, in `onSubmit` above, so this null-check never actually
  // renders nothing in practice.)
  if (orderPlaced) {
    return placedOrderId ? <OrderPlacementCelebration onComplete={handleCelebrationComplete} /> : null;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">
          Your bag is empty.
        </p>
        <Link
          href="/products"
          className="font-body text-sm text-primary hover:underline"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!cart.shipping.meetsMinimum) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">
          Your bag needs {cart.shipping.gramsToMinimum}g more to meet the
          minimum order weight.
        </p>
        <Link
          href="/cart"
          className="font-body text-sm text-primary hover:underline"
        >
          Back to bag
        </Link>
      </div>
    );
  }

  const estimatedTotal =
    cart.totalPaise +
    (cart.shipping.isFreeDelivery ? 0 : cart.shipping.shippingFeePaise) -
    cart.discountPaise;

  return (
    <div className="grid gap-6 pb-4 md:grid-cols-[1fr_320px] md:gap-8 md:pb-0">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg text-text-primary">
            Contact
          </h2>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.contactEmail?.message}
            {...register("contactEmail")}
          />
          {/* Client-review fix (2026-09-03): guests re-type their email —
              it's the only thread back to this order if they later create
              an account or already have a different one (see "Add a guest
              order" on the Orders page). A logged-in checkout's email
              comes from the account already, so this doesn't apply —
              CheckoutUseCase enforces the same rule server-side either way. */}
          {!user ? (
            <div className="mt-4">
              <FormField
                label="Confirm email"
                type="email"
                autoComplete="email"
                error={errors.confirmEmail?.message}
                {...register("confirmEmail", {
                  required: "Please confirm your email",
                  validate: (value) =>
                    value === watch("contactEmail") || "Emails do not match",
                })}
              />
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-display text-lg text-text-primary">
            Shipping address
          </h2>
          {savedAddresses.length > 0 ? (
            <CheckoutAddressPicker
              savedAddresses={savedAddresses}
              selectedAddressId={selectedAddressId}
              onSelectSaved={applySavedAddress}
              onSelectNew={resetToFreshAddress}
            />
          ) : null}
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
            <FormField
              label="City"
              autoComplete="address-level2"
              error={errors.address?.city?.message}
              {...register("address.city")}
            />
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
            <p
              className={`font-body text-xs ${deliveryEstimate.serviceable ? "text-text-secondary" : "text-error"}`}
            >
              {deliveryEstimate.serviceable
                ? `Delivers in ${deliveryEstimate.estimatedDeliveryDaysMin}-${deliveryEstimate.estimatedDeliveryDaysMax} days`
                : deliveryEstimate.reason}
            </p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg text-text-primary">
            Payment method
          </h2>
          {/* The order always lands at PENDING_PAYMENT at checkout time; the
              confirmation page drives each method the rest of the way — see
              the onSubmit comment above. */}
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-col gap-2"
              >
                <RadioGroupItem
                  value="COD"
                  label="Cash on delivery"
                  description="Pay when your order arrives"
                />
                <RadioGroupItem
                  value="RAZORPAY"
                  label="Pay online"
                  description="Card, UPI, or netbanking via Razorpay"
                />
              </RadioGroup>
            )}
          />
        </Card>

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting
            ? "Placing order…"
            : `Place order — ${formatPaiseAsInr(estimatedTotal)}`}
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
              <dd className="text-text-primary">
                {formatPaiseAsInr(cart.totalPaise)}
              </dd>
            </div>
            <div className="flex justify-between">
              {/* Weight-based items only (ADR-021) — a FIXED-priced accessory's weight never moves this figure, client-review fix 2026-09-04. */}
              <dt className="text-text-secondary">Total weight</dt>
              <dd className="text-text-primary">
                {formatGrams(cart.weightBasedTotalGrams)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Shipping</dt>
              <dd className="text-text-primary">
                {cart.shipping.isFreeDelivery
                  ? "Free"
                  : formatPaiseAsInr(cart.shipping.shippingFeePaise)}
              </dd>
            </div>
            {cart.discountPaise > 0 ? (
              <div className="flex justify-between">
                <dt className="text-text-secondary">Coupon discount</dt>
                <dd className="text-success">
                  -{formatPaiseAsInr(cart.discountPaise)}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex justify-between border-t border-border pt-4 font-body text-base font-medium">
            <span className="text-text-primary">Estimated total</span>
            <span className="text-text-primary">
              {formatPaiseAsInr(estimatedTotal)}
            </span>
          </div>
          <p className="mt-3 font-body text-xs text-text-secondary">
            Tax is calculated server-side and shown on your final order
            confirmation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
