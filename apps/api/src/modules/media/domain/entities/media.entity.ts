export type MediaStatus = "ACTIVE" | "DELETED";

export interface MediaEntity {
  id: string;
  type: "IMAGE";
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  status: MediaStatus;
  uploadedByUserId: string;
  createdAt: Date;
}
