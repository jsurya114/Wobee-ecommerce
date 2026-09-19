import type { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../shared/errors";
import type { MediaEntity } from "../../domain/entities/media.entity";
import { S3MediaStorage, type S3CommandSender } from "../../infrastructure/storage/s3-media-storage.service";
import type { CreateMediaInput, MediaRepositoryPort } from "../ports/media-repository.port";
import { UploadMediaUseCase } from "./upload-media.use-case";

const BASE = "https://d111111abcdef8.cloudfront.net";

function setup(repositoryFails = false) {
  const sent: Array<PutObjectCommand | DeleteObjectCommand> = [];
  const client: S3CommandSender = {
    async send(command) {
      sent.push(command);
      return {};
    },
  };
  const created: CreateMediaInput[] = [];
  const repository: MediaRepositoryPort = {
    async create(input) {
      if (repositoryFails) throw new Error("db down");
      created.push(input);
      return { id: "m1", ...input } as unknown as MediaEntity;
    },
    async findById() {
      return null;
    },
    async markDeleted() {
      throw new Error("not used");
    },
  };
  const useCase = new UploadMediaUseCase(new S3MediaStorage({ client, bucket: "b", publicBaseUrl: BASE }), repository);
  return { useCase, sent, created };
}

const command = {
  buffer: Buffer.from([1, 2, 3]),
  originalFilename: "p.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 3,
  uploadedByUserId: "u1",
};

describe("UploadMediaUseCase with S3 storage", () => {
  it("stores the object in S3 and records the CloudFront URL — not an S3 URL", async () => {
    const { useCase, sent, created } = setup();

    await useCase.execute(command);

    expect(sent).toHaveLength(1);
    expect(created[0]?.url.startsWith(`${BASE}/`)).toBe(true);
    expect(created[0]?.url).not.toContain("amazonaws.com");
    expect(created[0]?.key).toBe((sent[0] as PutObjectCommand).input.Key);
  });

  it("does not touch S3 for a file that fails validation", async () => {
    const { useCase, sent } = setup();

    await expect(useCase.execute({ ...command, mimeType: "application/pdf" })).rejects.toBeInstanceOf(ValidationError);
    expect(sent).toHaveLength(0);
  });

  it("removes the just-uploaded object if recording it in the database fails", async () => {
    const { useCase, sent } = setup(true);

    await expect(useCase.execute(command)).rejects.toThrow("db down");

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ input: { Bucket: "b" } });
    expect((sent[1] as DeleteObjectCommand).input.Key).toBe((sent[0] as PutObjectCommand).input.Key);
  });
});
