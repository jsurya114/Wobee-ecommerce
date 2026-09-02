"use client";

import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as collectionsApi from "../api/admin-collections.client";
import { CollectionForm } from "./CollectionForm";

export function NewCollectionForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();

  return (
    <Card className="max-w-xl p-4">
      <CollectionForm
        submitLabel="Create collection"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => collectionsApi.createCollection(payload, token));
          toast.success("Collection created");
          router.push(`/collections/${result.collection.id}`);
        }}
      />
    </Card>
  );
}
