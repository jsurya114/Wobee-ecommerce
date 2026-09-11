"use client";

import { Button, Skeleton } from "@woobe/ui";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as testimonialsApi from "../api/testimonials.client";
import { ShareExperienceForm } from "./ShareExperienceForm";

/**
 * The order-detail "Share your experience" surface — only rendered by the
 * caller for a DELIVERED order (see OrderDetail.tsx). Three states, and
 * only three: no testimonial yet (CTA + form), a testimonial already
 * exists (calm static card), or just-submitted (the same calm card,
 * reached without a page reload). There is deliberately no fourth state —
 * the 2026-09-11 design's central anti-abuse rule is that PENDING,
 * APPROVED, and REJECTED all render identically here. A customer who was
 * quietly rejected sees exactly what a customer still awaiting moderation
 * sees; there is no way to tell the two apart, and no resubmit affordance
 * either way.
 */
export function TestimonialCta({ orderId }: { orderId: string }) {
  const { accessToken } = useAuth();
  const [exists, setExists] = useState<boolean | null>(null);
  const [writing, setWriting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await testimonialsApi.getMyTestimonialForOrder(orderId, accessToken);
      setExists(result.exists);
    } catch {
      setExists(false); // A transient failure just hides the CTA rather than breaking the order page.
    }
  }, [orderId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!accessToken || exists === null) {
    return <Skeleton className="h-10 w-40" />;
  }

  if (exists || justSubmitted) {
    return <p className="font-body text-sm text-text-secondary">Thank you for sharing your experience.</p>;
  }

  if (writing) {
    return (
      <ShareExperienceForm
        orderId={orderId}
        accessToken={accessToken}
        onSubmitted={() => {
          setJustSubmitted(true);
          setWriting(false);
        }}
      />
    );
  }

  return (
    <Button type="button" variant="secondary" onClick={() => setWriting(true)}>
      Share your experience
    </Button>
  );
}
