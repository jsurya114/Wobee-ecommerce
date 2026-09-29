"use client";

import { Button } from "@woobe/ui";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { uploadMedia } from "@/features/products/api/admin-media.client";
import { ApiError } from "@/lib/api-client";
import { resolveImageUrl } from "@/lib/resolve-image-url";

/**
 * Optional single-image field (2026-09-29) — upload / preview / replace /
 * remove, through the existing media endpoint (`uploadMedia`), same
 * behaviour CategoryForm's own image field has. `value` is "" when nothing
 * is set; "Remove" sets it back to "", which callers send as null so the
 * storefront falls back to its derived image.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  altText,
  emptyHint,
  error,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  altText: string;
  /** Shown in the empty preview box — says what the storefront uses instead. */
  emptyHint?: string;
  error?: string;
}) {
  const { withFreshToken } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const media = await withFreshToken((token) => uploadMedia(file, altText, token));
      onChange(media.url);
    } catch (uploadError) {
      toast.error(uploadError instanceof ApiError ? uploadError.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-sm font-medium text-text-primary">{label}</span>
      {value ? (
        // Plain <img>, not next/image — same reasoning as ProductImages'/BannerForm's own thumbnail.
        <img src={resolveImageUrl(value)!} alt="" className="h-24 w-32 rounded-control object-cover" />
      ) : (
        <div className="flex h-24 w-32 items-center justify-center rounded-control border border-dashed border-border px-2 text-center text-xs text-text-secondary">
          {emptyHint ?? "No image"}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFileSelected(e)} />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="self-start">
          {value ? "Replace image" : "Upload image"}
        </Button>
        {value ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange("")} className="self-start">
            Remove
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
