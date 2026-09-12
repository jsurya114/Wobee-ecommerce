"use client";

import { Button, FormField, Textarea } from "@woobe/ui";
import { useState } from "react";
import { useFormError } from "@/lib/use-form-error";
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
  const { fieldErrors, formError, handle, clear } = useFormError();

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setIsSubmitting(true);
    try {
      await onSubmit({ name, slug, description: description || undefined });
    } catch (error) {
      handle(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // noValidate: onFormSubmit's own catch already surfaces the backend's real validation
  // message via useFormError, inline per field — native HTML validation was intercepting
  // submission before that ever ran, showing the browser's own generic bubble instead.
  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} required error={fieldErrors.name} />
        <FormField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required error={fieldErrors.slug} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="collection-description">
          Description (optional)
        </label>
        <Textarea id="collection-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        {fieldErrors.description ? (
          <p role="alert" className="font-body text-sm text-error">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
