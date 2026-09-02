"use client";

import { Button, Card, Spinner } from "@woobe/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as reviewsApi from "../api/reviews.client";
import type { ListReviewsResult } from "../api/reviews.client";
import { RatingSummaryDisplay } from "./RatingSummaryDisplay";
import { ReviewCard } from "./ReviewCard";
import { ReviewForm } from "./ReviewForm";

/**
 * week2 (1).md §8: "View reviews", "Rating summary", "Submit review". Every
 * mutation reloads the server's own view rather than optimistically
 * inserting a client-guessed row — a submitted review starts PENDING and
 * doesn't appear here until an admin approves it (reviews.module.ts's own
 * doc comment), so silently adding it to the list would show something
 * that isn't actually visible to anyone else yet.
 *
 * `initialReviews` is the same first page (page 1, default pageSize) the
 * PDP server component already fetched for its JSON-LD aggregateRating
 * (2026-09-02 perf audit fix) — seeding state with it means the initial
 * render has real content immediately, no spinner, and no redundant
 * refetch of the page the server just rendered. Only a genuine interaction
 * (write a review, load more/pagination, refresh after submit) — or SSR
 * having failed/omitted it (`initialReviews === null`) — triggers a client
 * fetch.
 */
export function ReviewsSection({ productId, initialReviews = null }: { productId: string; initialReviews?: ListReviewsResult | null }) {
  const { status: authStatus } = useAuth();
  const [result, setResult] = useState<ListReviewsResult | null>(initialReviews);
  const [isLoading, setIsLoading] = useState(initialReviews === null);
  const [isWriting, setIsWriting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await reviewsApi.listReviews(productId);
      setResult(data);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (initialReviews) return; // SSR already provided this exact first page — don't fetch it again on mount.
    void load();
  }, [initialReviews, load]);

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="mb-4 font-display text-xl text-text-primary">Reviews</h2>

      {isLoading || !result ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <RatingSummaryDisplay summary={result.ratingSummary} />

          <div className="mt-6">
            {isWriting ? (
              <Card className="p-5">
                <ReviewForm
                  productId={productId}
                  onSubmitted={() => {
                    setIsWriting(false);
                    void load();
                  }}
                />
              </Card>
            ) : authStatus === "authenticated" ? (
              <Button type="button" variant="secondary" onClick={() => setIsWriting(true)}>
                Write a review
              </Button>
            ) : authStatus === "unauthenticated" ? (
              <p className="font-body text-sm text-text-secondary">
                <Link href="/login" className="text-primary hover:underline">
                  Log in
                </Link>{" "}
                to write a review.
              </p>
            ) : null}
          </div>

          <div className="mt-4">
            {result.items.length === 0 ? null : result.items.map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
        </>
      )}
    </section>
  );
}
