"use client";

import { Button, Textarea } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as testimonialsApi from "../api/testimonials.client";
import { StarRatingInput } from "./StarRating";

const MAX_IMAGES = 3;
const MIN_TEXT_LENGTH = 10;

/**
 * The whole "Share your experience" form — star rating, text, optional
 * photos, one Submit. On success this calls `onSubmitted()` and the parent
 * (TestimonialCta) replaces this form with the calm "Thank you" state —
 * there is no intermediate "pending review" copy anywhere in this
 * component, per the 2026-09-11 design's anti-abuse rule (the customer
 * must never learn the moderation state).
 */
export function ShareExperienceForm({ orderId, accessToken, onSubmitted }: { orderId: string; accessToken: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = [...images, ...Array.from(fileList)].slice(0, MAX_IMAGES);
    setImages(next);
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, i) => i !== index));
  };

  const onSubmit = async () => {
    if (rating < 1) {
      toast.error("Please choose a star rating.");
      return;
    }
    if (text.trim().length < MIN_TEXT_LENGTH) {
      toast.error("Tell us a little more about your experience.");
      return;
    }
    setIsSubmitting(true);
    try {
      await testimonialsApi.submitTestimonial({ orderId, rating, text: text.trim(), images }, accessToken);
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-body text-sm font-medium text-text-primary">Your Woobe experience</span>
        <StarRatingInput value={rating} onChange={setRating} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="testimonial-text">
          Tell us about your experience
        </label>
        <Textarea
          id="testimonial-text"
          placeholder="The fabric, the fit, how it arrived — anything you'd want other shoppers to know."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-body text-sm font-medium text-text-primary">Photos (optional)</span>
        <div className="flex flex-wrap gap-2">
          {images.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-control border border-border">
              <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label="Remove photo"
                className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-control bg-black/60 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-control border border-dashed border-border font-body text-xs text-text-secondary hover:border-primary">
              + Add
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => onFilesSelected(e.target.files)} />
            </label>
          ) : null}
        </div>
        <p className="font-body text-xs text-text-secondary">Up to {MAX_IMAGES} photos, JPEG/PNG/WebP.</p>
      </div>

      <Button type="button" onClick={() => void onSubmit()} isLoading={isSubmitting} className="self-start">
        Submit
      </Button>
    </div>
  );
}
