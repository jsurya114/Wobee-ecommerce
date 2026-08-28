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
 */
export function ReviewsSection({ productId }: { productId: string }) {
  const { status: authStatus } = useAuth();
  const [result, setResult] = useState<ListReviewsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    void load();
  }, [load]);

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
