"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as offersApi from "../api/admin-offers.client";
import { offersAdminQueryKey } from "../hooks/useAdminOffers";
import { OfferForm } from "./OfferForm";

export function NewOfferForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  return (
    <Card className="max-w-xl p-4">
      <OfferForm
        submitLabel="Create offer"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => offersApi.createOffer(payload, token));
          await queryClient.invalidateQueries({ queryKey: offersAdminQueryKey });
          toast.success("Offer created");
          router.push(`/offers/${result.offer.id}`);
        }}
      />
    </Card>
  );
}
