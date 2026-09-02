"use client";

import { Badge, Button, EmptyState } from "@woobe/ui";
import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { AdminBanner } from "../api/admin-banners.client";

export function BannersTable({
  items,
  onSetActive,
  onRemove,
  onReorder,
}: {
  items: AdminBanner[];
  onSetActive: (id: string, isActive: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (bannerIds: string[]) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyState icon={<ImageIcon />} title="No banners yet" description="Create a banner to feature it on the storefront." />;
  }

  const withBusy = async (id: string, action: () => Promise<void>, failureMessage: string) => {
    setBusyId(id);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : failureMessage);
    } finally {
      setBusyId(null);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    return withBusy(moved!.id, () => onReorder(reordered.map((b) => b.id)), "Couldn't reorder banners.");
  };

  return (
    <div className="flex flex-col gap-3">
      {items.map((banner, index) => (
        <div key={banner.id} className="flex items-center gap-3 rounded-control border border-border p-3">
          {/* Plain <img>, not next/image — same reasoning as ProductsTable's own thumbnail. */}
          <img src={banner.imageUrl} alt="" className="h-12 w-20 shrink-0 rounded-control object-cover" />

          <div className="min-w-0 flex-1">
            <Link href={`/banners/${banner.id}`} className="truncate font-body text-sm font-medium text-primary hover:underline">
              {banner.title || "Untitled banner"}
            </Link>
            <p className="truncate font-body text-xs text-text-secondary">{banner.subtitle || "—"}</p>
          </div>

          <Badge variant={banner.isActive ? "success" : "neutral"}>{banner.isActive ? "active" : "inactive"}</Badge>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Move up"
              disabled={index === 0 || busyId === banner.id}
              onClick={() => void move(index, -1)}
              className="rounded-control p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={index === items.length - 1 || busyId === banner.id}
              onClick={() => void move(index, 1)}
              className="rounded-control p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={busyId === banner.id}
              onClick={() => void withBusy(banner.id, () => onSetActive(banner.id, !banner.isActive), "That didn't work.")}
            >
              {banner.isActive ? "Deactivate" : "Activate"}
            </Button>
            <button
              type="button"
              aria-label="Delete banner"
              disabled={busyId === banner.id}
              onClick={() => void withBusy(banner.id, () => onRemove(banner.id), "Couldn't delete this banner.")}
              className="rounded-control p-1.5 text-text-secondary hover:text-error disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
