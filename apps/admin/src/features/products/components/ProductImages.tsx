"use client";

import { Button } from "@woobe/ui";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { resolveImageUrl } from "@/lib/resolve-image-url";
import { uploadMedia } from "../api/admin-media.client";
import type { AdminProductImage } from "../api/admin-products.client";

/**
 * week2 (1).md §16's "Media" operation — two real steps under the hood
 * (upload the file via Week 2 Day 4's `media` module, then attach the
 * returned URL to this product), presented as one "Upload image" button.
 * Reordering is plain move-left/move-right rather than drag-and-drop — no
 * drag library exists in this codebase yet, and a product's image count is
 * small enough that this stays a one-click operation either way.
 */
export function ProductImages({
  images,
  onAdd,
  onRemove,
  onReorder,
}: {
  images: AdminProductImage[];
  onAdd: (url: string, altText: string) => Promise<void>;
  onRemove: (imageId: string) => Promise<void>;
  onReorder: (imageIds: string[]) => Promise<void>;
}) {
  const { withFreshToken } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bulk upload (2026-09-28): files go up ONE AT A TIME — never in parallel — so a
  // 20-image selection can't flood the API or trip its rate limits.
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const isUploading = progress !== null;
  const [busyId, setBusyId] = useState<string | null>(null);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) later
    if (files.length === 0) return;

    let succeeded = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length });
        try {
          const media = await withFreshToken((token) => uploadMedia(file, `Product image`, token));
          await onAdd(media.url, media.altText ?? "Product image");
          succeeded += 1;
        } catch (error) {
          // One bad file never aborts the rest of the batch.
          const reason = error instanceof ApiError ? error.message : "Upload failed.";
          toast.error(files.length > 1 ? `${file.name}: ${reason}` : reason);
        }
      }
    } finally {
      setProgress(null);
    }

    if (files.length === 1) {
      if (succeeded === 1) toast.success("Image added");
    } else if (succeeded === files.length) {
      toast.success(`${succeeded} images uploaded successfully`);
    } else if (succeeded > 0) {
      toast.warning(`${succeeded} of ${files.length} images uploaded`);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    await onReorder(reordered.map((img) => img.id));
  };

  const remove = async (imageId: string) => {
    setBusyId(imageId);
    try {
      await onRemove(imageId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't remove that image.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div key={image.id} className="relative flex flex-col gap-1">
            {/* Plain <img>, not next/image — same reasoning as ProductsTable's own thumbnail. */}
            <img src={resolveImageUrl(image.url)!} alt={image.altText} className="h-24 w-24 rounded-control object-cover" />
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                aria-label="Move left"
                disabled={index === 0}
                onClick={() => void move(index, -1)}
                className="rounded-control p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Remove image"
                disabled={busyId === image.id}
                onClick={() => void remove(image.id)}
                className="rounded-control p-1 text-text-secondary hover:text-error disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Move right"
                disabled={index === images.length - 1}
                onClick={() => void move(index, 1)}
                className="rounded-control p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onFileSelected(e)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" isLoading={isUploading} onClick={() => fileInputRef.current?.click()}>
          {isUploading ? "Uploading…" : "Upload images"}
        </Button>
        {progress ? (
          <div className="flex min-w-40 flex-col gap-1" role="status" aria-live="polite">
            <span className="font-body text-sm text-text-secondary">
              Uploading {progress.current} of {progress.total}…
            </span>
            <progress
              className="h-1.5 w-full overflow-hidden rounded-full accent-primary"
              max={progress.total}
              value={progress.current - 1}
              aria-label="Upload progress"
            />
          </div>
        ) : (
          <span className="font-body text-xs text-text-secondary">You can select several images at once.</span>
        )}
      </div>
    </div>
  );
}
