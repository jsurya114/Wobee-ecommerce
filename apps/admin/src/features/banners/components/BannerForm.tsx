"use client";

import { Button, FormField } from "@woobe/ui";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { uploadMedia } from "@/features/products/api/admin-media.client";
import { ApiError } from "@/lib/api-client";
import type { BannerPayload } from "../api/admin-banners.client";

/** `datetime-local` has no timezone in its value — treat it as the browser's local time, same as any other admin date-time input in this app. */
function toIsoOrUndefined(localValue: string): string | undefined {
  return localValue ? new Date(localValue).toISOString() : undefined;
}

function isoToLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  // "YYYY-MM-DDTHH:mm" — what <input type="datetime-local"> expects, trimmed from the full ISO string.
  return new Date(iso).toISOString().slice(0, 16);
}

export function BannerForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: Partial<BannerPayload>;
  submitLabel: string;
  onSubmit: (payload: BannerPayload) => Promise<void>;
}) {
  const { accessToken } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialValues?.imageUrl ?? "");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialValues?.subtitle ?? "");
  const [ctaLabel, setCtaLabel] = useState(initialValues?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(initialValues?.ctaUrl ?? "");
  const [startAt, setStartAt] = useState(isoToLocalInputValue(initialValues?.startAt));
  const [endAt, setEndAt] = useState(isoToLocalInputValue(initialValues?.endAt));
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    setIsUploading(true);
    try {
      const media = await uploadMedia(file, title || "Promo banner", accessToken);
      setImageUrl(media.url);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) {
      toast.error("Upload an image first");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        imageUrl,
        title: title || null,
        subtitle: subtitle || null,
        ctaLabel: ctaLabel || null,
        ctaUrl: ctaUrl || null,
        startAt: toIsoOrUndefined(startAt) ?? null,
        endAt: toIsoOrUndefined(endAt) ?? null,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-body text-sm font-medium text-text-primary">Image</span>
        {imageUrl ? (
          // Plain <img>, not next/image — same reasoning as ProductImages' own thumbnail (arbitrary admin-entered URL).
          <img src={imageUrl} alt="" className="aspect-[21/9] w-full max-w-md rounded-control object-cover" />
        ) : (
          <div className="flex aspect-[21/9] w-full max-w-md items-center justify-center rounded-control border border-dashed border-border text-xs text-text-secondary">
            No image yet
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFileSelected(e)}
        />
        <Button type="button" variant="secondary" size="sm" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="self-start">
          {imageUrl ? "Replace image" : "Upload image"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <FormField label="Subtitle (optional)" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        <FormField label="CTA label (optional)" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
        <FormField
          label="CTA link (optional)"
          value={ctaUrl}
          onChange={(e) => setCtaUrl(e.target.value)}
          placeholder="/products?category=dresses"
        />
        <FormField label="Starts (optional)" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        <FormField label="Ends (optional)" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
