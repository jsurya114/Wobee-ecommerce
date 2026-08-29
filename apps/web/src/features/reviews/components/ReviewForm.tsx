"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { submitReviewSchema, type SubmitReviewInput } from "@woobe/validation";
import { Button, FormField, Textarea } from "@woobe/ui";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import * as reviewsApi from "../api/reviews.client";
import { StarRatingInput } from "./StarRating";

export function ReviewForm({ productId, onSubmitted }: { productId: string; onSubmitted: () => void }) {
  const { accessToken } = useAuth();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SubmitReviewInput>({
    resolver: zodResolver(submitReviewSchema),
    defaultValues: { productId, rating: 0 },
  });

  const onSubmit = handleSubmit(async (data) => {
    if (!accessToken) return;
    try {
      await reviewsApi.submitReview(data, accessToken);
      toast.success("Thanks for your review! It'll appear once approved.");
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Controller
        control={control}
        name="rating"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-medium text-text-primary">Your rating</span>
            <StarRatingInput value={field.value} onChange={field.onChange} />
            {errors.rating ? <p className="font-body text-sm text-error">{errors.rating.message}</p> : null}
          </div>
        )}
      />
      <FormField label="Title (optional)" error={errors.title?.message} {...register("title")} />
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="review-body">
          Review (optional)
        </label>
        <Textarea id="review-body" invalid={Boolean(errors.body)} {...register("body")} />
        {errors.body ? <p className="font-body text-sm text-error">{errors.body.message}</p> : null}
      </div>
      <Button type="submit" isLoading={isSubmitting} className="self-start">
        Submit review
      </Button>
    </form>
  );
}
