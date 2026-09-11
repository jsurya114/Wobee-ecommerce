"use client";

import { Badge, Button, EmptyState } from "@woobe/ui";
import { MessageSquareQuote, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { AdminTestimonial } from "../api/admin-testimonials.client";

const STATUS_VARIANT: Record<AdminTestimonial["status"], "success" | "error" | "neutral"> = {
  APPROVED: "success",
  REJECTED: "error",
  PENDING: "neutral",
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`h-3.5 w-3.5 ${star <= rating ? "fill-amber-500 text-amber-500" : "text-border"}`} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * Card list, not a table — a testimonial's real content (text, photos) is
 * exactly what a moderator needs to see to decide, and a table row would
 * either truncate it into uselessness or need a separate detail page for
 * every single decision. One inline Approve/Reject pair per PENDING card
 * (2026-09-11 design: PENDING -> APPROVED or PENDING -> REJECTED only,
 * REJECTED is terminal — so an already-moderated card shows its status
 * badge with no actions at all, never a resubmit/undo).
 */
export function TestimonialsList({
  items,
  onApprove,
  onReject,
}: {
  items: AdminTestimonial[];
  onApprove: (id: string) => Promise<unknown>;
  onReject: (id: string) => Promise<unknown>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyState icon={<MessageSquareQuote />} title="No testimonials found" description="Try a different filter." />;
  }

  const run = async (id: string, action: (id: string) => Promise<unknown>, successMessage: string) => {
    setBusyId(id);
    try {
      await action(id);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {items.map((testimonial) => (
        <div key={testimonial.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-body text-sm font-medium text-text-primary">{testimonial.customerName}</p>
              <p className="font-body text-xs text-text-secondary">
                {testimonial.customerEmail} · Order {testimonial.orderNumber}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[testimonial.status]}>{testimonial.status.toLowerCase()}</Badge>
          </div>

          <Stars rating={testimonial.rating} />

          <p className="font-body text-sm text-text-primary">{testimonial.text}</p>

          {testimonial.images.length > 0 ? (
            <div className="flex gap-2">
              {testimonial.images.map((image) => (
                <img key={image.id} src={image.url} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
              ))}
            </div>
          ) : null}

          <p className="font-body text-xs text-text-secondary">Submitted {new Date(testimonial.createdAt).toLocaleString()}</p>

          {testimonial.status === "PENDING" ? (
            <div className="flex gap-2">
              <Button onClick={() => void run(testimonial.id, onApprove, "Testimonial approved")} isLoading={busyId === testimonial.id} size="sm">
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => void run(testimonial.id, onReject, "Testimonial rejected")}
                isLoading={busyId === testimonial.id}
                size="sm"
              >
                Reject
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
