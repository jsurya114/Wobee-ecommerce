"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, EmptyState } from "@woobe/ui";
import { Percent } from "lucide-react";
import Link from "next/link";
import type { AdminOffer } from "../api/admin-offers.client";

type OfferStatus = "scheduled" | "active" | "expired" | "disabled";

/**
 * Derived purely from `isActive` + `startsAt`/`endsAt` vs. the current
 * time — no backend "status" field, no cron job (spec's own "status
 * should be derived correctly from current time + isActive... do not
 * require a cron job just to display status"). Mirrors `isOfferActive`
 * (apps/api offers domain) exactly, just adding the two non-eligible
 * sub-states (scheduled vs. expired) a plain boolean doesn't distinguish.
 */
function resolveOfferStatus(offer: AdminOffer, now: Date): OfferStatus {
  if (!offer.isActive) return "disabled";
  const startsAt = new Date(offer.startsAt);
  const endsAt = new Date(offer.endsAt);
  if (now < startsAt) return "scheduled";
  if (now >= endsAt) return "expired";
  return "active";
}

const STATUS_LABEL: Record<OfferStatus, string> = { scheduled: "scheduled", active: "active", expired: "expired", disabled: "disabled" };
const STATUS_VARIANT: Record<OfferStatus, "success" | "neutral" | "outline"> = {
  active: "success",
  scheduled: "outline",
  expired: "neutral",
  disabled: "neutral",
};

export function OffersTable({ items }: { items: AdminOffer[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<Percent />} title="No offers yet" description="Create an offer to automatically discount a category, selected products, or the whole store." />;
  }

  const now = new Date();

  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[760px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pl-4 pr-4">
              Name
            </th>
            <th scope="col" className="py-2 pr-4">
              Discount
            </th>
            <th scope="col" className="py-2 pr-4">
              Applies to
            </th>
            <th scope="col" className="py-2 pr-4">
              Ends
            </th>
            <th scope="col" className="py-2 pr-4">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((offer) => {
            const status = resolveOfferStatus(offer, now);
            return (
              <tr key={offer.id} className="border-b border-border last:border-0 hover:bg-primary-tint/30">
                <td className="py-2.5 pl-4 pr-4">
                  <Link href={`/offers/${offer.id}`} className="font-medium text-primary hover:underline">
                    {offer.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-text-primary">{formatDiscount(offer)}</td>
                <td className="py-2.5 pr-4 text-text-secondary">{formatScope(offer)}</td>
                <td className="py-2.5 pr-4 text-text-secondary">{new Date(offer.endsAt).toLocaleString("en-IN")}</td>
                <td className="py-2.5 pr-4">
                  <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDiscount(offer: AdminOffer): string {
  return offer.discountType === "PERCENTAGE" ? `${offer.discountValue}%` : formatPaiseAsInr(offer.discountValue);
}

function formatScope(offer: AdminOffer): string {
  switch (offer.scope) {
    case "ALL_PRODUCTS":
      return "Entire store";
    case "CATEGORY":
      return "One category";
    case "PRODUCTS":
      return `${offer.productIds.length} product${offer.productIds.length === 1 ? "" : "s"}`;
  }
}
