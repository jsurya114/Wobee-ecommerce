import { apiFetch } from "@/lib/api-client";

export interface AdminCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
}

export interface AdminCollectionDetail extends AdminCollection {
  productIds: string[];
}

export interface CollectionPayload {
  name: string;
  slug: string;
  description?: string;
}

export function listCollections(accessToken: string): Promise<{ collections: AdminCollection[] }> {
  return apiFetch("/api/v1/admin/collections", { accessToken });
}

export function getCollection(id: string, accessToken: string): Promise<{ collection: AdminCollectionDetail }> {
  return apiFetch(`/api/v1/admin/collections/${id}`, { accessToken });
}

export function createCollection(input: CollectionPayload, accessToken: string): Promise<{ collection: AdminCollection }> {
  return apiFetch("/api/v1/admin/collections", { method: "POST", body: input, accessToken });
}

export function updateCollection(id: string, input: Partial<CollectionPayload>, accessToken: string): Promise<{ collection: AdminCollection }> {
  return apiFetch(`/api/v1/admin/collections/${id}`, { method: "PATCH", body: input, accessToken });
}

export function setCollectionActive(id: string, isActive: boolean, accessToken: string): Promise<{ collection: AdminCollection }> {
  return apiFetch(`/api/v1/admin/collections/${id}/active`, { method: "POST", body: { isActive }, accessToken });
}

export function assignProduct(collectionId: string, productId: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/collections/${collectionId}/products`, { method: "POST", body: { productId }, accessToken });
}

export function removeProduct(collectionId: string, productId: string, accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/collections/${collectionId}/products/${productId}`, { method: "DELETE", accessToken });
}

export function reorderProducts(collectionId: string, productIds: string[], accessToken: string): Promise<void> {
  return apiFetch(`/api/v1/admin/collections/${collectionId}/products/order`, { method: "PUT", body: { productIds }, accessToken });
}
