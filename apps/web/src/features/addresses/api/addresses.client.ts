import type { CreateAddressInput, UpdateAddressInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: string;
}

export function listAddresses(accessToken: string): Promise<{ addresses: Address[] }> {
  return apiFetch<{ addresses: Address[] }>("/api/v1/users/me/addresses", { accessToken });
}

export function createAddress(input: CreateAddressInput, accessToken: string): Promise<{ address: Address }> {
  return apiFetch<{ address: Address }>("/api/v1/users/me/addresses", { method: "POST", body: input, accessToken });
}

export function updateAddress(id: string, input: UpdateAddressInput, accessToken: string): Promise<{ address: Address }> {
  return apiFetch<{ address: Address }>(`/api/v1/users/me/addresses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    accessToken,
  });
}

export function deleteAddress(id: string, accessToken: string): Promise<void> {
  return apiFetch<void>(`/api/v1/users/me/addresses/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
}

export function setDefaultAddress(id: string, accessToken: string): Promise<{ address: Address }> {
  return apiFetch<{ address: Address }>(`/api/v1/users/me/addresses/${encodeURIComponent(id)}/default`, {
    method: "POST",
    accessToken,
  });
}
