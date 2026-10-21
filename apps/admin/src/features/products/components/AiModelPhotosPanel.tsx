"use client";

import { Badge, Button } from "@woobe/ui";
import { Check, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { resolveImageUrl } from "@/lib/resolve-image-url";
import { AI_IMAGE_ANGLES } from "../api/admin-ai-images.client";
import type { AiGeneratedImage, AiImageAngle } from "../api/admin-ai-images.client";
import { uploadMedia } from "../api/admin-media.client";
import { useAiImages } from "../hooks/useAiImages";

const ANGLE_LABEL: Record<AiImageAngle, string> = { FRONT: "Front", BACK: "Back", SIDE: "Side", DETAIL: "Detail" };
const IN_FLIGHT = new Set(["PENDING", "PROCESSING"]);

/**
 * AI model photos: the admin picks a plain photo of the garment, the API renders
 * on-model shots per angle in the background, and nothing reaches the storefront
 * until the admin approves it here (approval attaches it as a normal product image).
 */
export function AiModelPhotosPanel({ productId }: { productId: string }) {
  const { withFreshToken } = useAdminAuth();
  const { generations, generate, approve, reject, regenerate } = useAiImages(productId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [angles, setAngles] = useState<Set<AiImageAngle>>(new Set(AI_IMAGE_ANGLES));
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = (angle: AiImageAngle) =>
    setAngles((current) => {
      const next = new Set(current);
      if (next.has(angle)) next.delete(angle);
      else next.add(angle);
      return next;
    });

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStarting(true);
    try {
      const media = await withFreshToken((token) => uploadMedia(file, "Garment photo", token));
      await generate(media.id, AI_IMAGE_ANGLES.filter((a) => angles.has(a)));
      toast.success("Generating model photos — this takes about a minute.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't start generation.");
    } finally {
      setStarting(false);
    }
  };

  const act = async (id: string, action: (id: string) => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await action(id);
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="font-body text-xs text-text-secondary">
        Upload a photo of the garment (flat or on a hanger). AI creates photos of a model wearing it. Review each one before it goes live.
      </p>

      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Angles to generate</legend>
        {AI_IMAGE_ANGLES.map((angle) => (
          <label key={angle} className="flex items-center gap-1.5 font-body text-sm text-text-primary">
            <input type="checkbox" checked={angles.has(angle)} onChange={() => toggle(angle)} />
            {ANGLE_LABEL[angle]}
          </label>
        ))}
      </fieldset>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFileSelected(e)} />
      <div>
        <Button type="button" variant="secondary" size="sm" isLoading={starting} disabled={angles.size === 0} onClick={() => fileInputRef.current?.click()}>
          Choose garment photo &amp; generate
        </Button>
      </div>

      {generations.map((generation) => (
        <div key={generation.id} className="flex flex-wrap gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1">
            <img src={resolveImageUrl(generation.sourceUrl)!} alt="Original garment" className="h-32 w-24 rounded-control object-cover" />
            <span className="text-center font-body text-xs text-text-secondary">Original</span>
          </div>
          {generation.images.map((image) => (
            <GeneratedTile
              key={image.id}
              image={image}
              busy={busyId === image.id}
              onApprove={() => void act(image.id, approve, "Added to product images")}
              onReject={() => void act(image.id, reject, "Discarded")}
              onRegenerate={() => void act(image.id, regenerate, "Regenerating…")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function GeneratedTile({ image, busy, onApprove, onReject, onRegenerate }: { image: AiGeneratedImage; busy: boolean; onApprove: () => void; onReject: () => void; onRegenerate: () => void }) {
  const inFlight = IN_FLIGHT.has(image.status);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-32 w-24 items-center justify-center overflow-hidden rounded-control border border-border bg-surface">
        {image.url && (image.status === "READY" || image.status === "APPROVED") ? (
          <img src={resolveImageUrl(image.url)!} alt={`${ANGLE_LABEL[image.angle]} view (AI generated)`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-1 text-center font-body text-xs text-text-secondary" role="status">
            {inFlight ? "Generating…" : image.status === "FAILED" ? "Failed" : "Discarded"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="font-body text-xs text-text-primary">{ANGLE_LABEL[image.angle]}</span>
        {image.status === "APPROVED" && <Badge variant="success">added</Badge>}
      </div>
      {image.status === "FAILED" && image.error && <span className="max-w-24 font-body text-xs text-error">{image.error}</span>}
      <div className="flex items-center gap-1">
        {image.status === "READY" && (
          <>
            <button type="button" aria-label="Approve and add to product" disabled={busy} onClick={onApprove} className="rounded-control p-1 text-text-secondary hover:text-success disabled:opacity-30">
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Discard" disabled={busy} onClick={onReject} className="rounded-control p-1 text-text-secondary hover:text-error disabled:opacity-30">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        {(image.status === "READY" || image.status === "FAILED" || image.status === "REJECTED") && (
          <button type="button" aria-label="Regenerate" disabled={busy} onClick={onRegenerate} className="rounded-control p-1 text-text-secondary hover:text-text-primary disabled:opacity-30">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
