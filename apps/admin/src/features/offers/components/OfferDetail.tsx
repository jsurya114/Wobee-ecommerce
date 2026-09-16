"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useSaveAndRedirect } from "@/lib/use-save-and-redirect";
import { useAdminOffer } from "../hooks/useAdminOffer";
import { OfferForm, toDatetimeLocalValue, toRupeesValue } from "./OfferForm";

export function OfferDetail({ offerId }: { offerId: string }) {
  const saveAndRedirect = useSaveAndRedirect("/offers");
  const { offer, loading, error, update, setActive } = useAdminOffer(offerId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  // Bumped after every successful save so OfferForm below remounts with fresh values — same fix ProductDetail/CouponDetail's own comment describes.
  const [saveGen, setSaveGen] = useState(0);

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!offer) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Offer not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!offer.isActive);
      toast.success(offer.isActive ? "Offer deactivated" : "Offer activated");
    } catch {
      toast.error("Couldn't update status.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl text-text-primary">{offer.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={offer.isActive ? "success" : "neutral"}>{offer.isActive ? "active" : "disabled"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {offer.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <OfferForm
          key={`${offerId}:${saveGen}`}
          initialValues={{
            name: offer.name,
            description: offer.description ?? "",
            discountType: offer.discountType,
            value: offer.discountType === "FIXED_AMOUNT" ? toRupeesValue(offer.discountValue) : String(offer.discountValue),
            scope: offer.scope,
            categoryId: offer.categoryId ?? "",
            productIds: offer.productIds,
            priority: String(offer.priority),
            startsAt: toDatetimeLocalValue(offer.startsAt),
            endsAt: toDatetimeLocalValue(offer.endsAt),
          }}
          submitLabel="Save changes"
          onSubmit={(payload) =>
            saveAndRedirect(async () => {
              await update(payload);
              setSaveGen((g) => g + 1);
            })
          }
        />
      </Card>
    </div>
  );
}
