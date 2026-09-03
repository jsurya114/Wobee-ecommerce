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
  const [isUploading, setIsUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setIsUploading(true);
    try {
      const media = await withFreshToken((token) => uploadMedia(file, `Product image`, token));
      await onAdd(media.url, media.altText ?? "Product image");
      toast.success("Image added");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
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

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFileSelected(e)} />
      <Button type="button" variant="secondary" size="sm" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="self-start">
        Upload image
      </Button>
    </div>
  );
}
