"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as bannersApi from "../api/admin-banners.client";
import { bannersQueryKey } from "../hooks/useAdminBanners";
import { BannerForm } from "./BannerForm";

export function NewBannerForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  return (
    <Card className="max-w-xl p-4">
      <BannerForm
        submitLabel="Create banner"
        onSubmit={async (payload) => {
          const result = await withFreshToken((token) => bannersApi.createBanner(payload, token));
          await queryClient.invalidateQueries({ queryKey: bannersQueryKey });
          toast.success("Banner created");
          router.push(`/banners/${result.banner.id}`);
        }}
      />
    </Card>
  );
}
