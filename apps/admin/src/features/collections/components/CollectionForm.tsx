"use client";

import { Button, FormField, Textarea } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { CollectionPayload } from "../api/admin-collections.client";

export function CollectionForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: Partial<CollectionPayload>;
  submitLabel: string;
  onSubmit: (payload: CollectionPayload) => Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [slug, setSlug] = useState(initialValues?.slug ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ name, slug, description: description || undefined });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <FormField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="collection-description">
          Description (optional)
        </label>
        <Textarea id="collection-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
