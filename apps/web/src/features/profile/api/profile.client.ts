import type { UpdateProfileInput } from "@woobe/validation";
import type { AuthUser } from "@/features/auth/api/auth.client";
import { apiFetch } from "@/lib/api-client";

export function updateProfile(input: UpdateProfileInput, accessToken: string): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/v1/users/me", { method: "PATCH", body: input, accessToken });
}
