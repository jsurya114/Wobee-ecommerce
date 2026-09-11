import { describe, expect, it, vi } from "vitest";
import { UnprocessableEntityError, ValidationError } from "../../../../shared/errors";
import { SubmitTestimonialUseCase } from "./submit-testimonial.use-case";

function makeUseCase(overrides: { orderStatus?: string; images?: { id: string; url: string }[] } = {}) {
  const testimonialRepository = {
    create: vi.fn().mockResolvedValue({
      id: "t1",
      orderId: "o1",
      customerId: "u1",
      rating: 5,
      text: "great",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [],
    }),
    addImage: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByOrderIdForCustomer: vi.fn(),
    listApproved: vi.fn(),
    getApprovedAggregate: vi.fn(),
    listForAdmin: vi.fn(),
    transitionStatus: vi.fn(),
  };
  const orderReader = {
    forCustomer: vi.fn().mockResolvedValue({ id: "o1", userId: "u1", status: overrides.orderStatus ?? "DELIVERED", orderNumber: "WOOBE-1" }),
  };
  const mediaUploader = {
    upload: vi.fn().mockResolvedValue({ id: "m1", url: "https://cdn/img.jpg" }),
  };
  const useCase = new SubmitTestimonialUseCase(testimonialRepository, orderReader, mediaUploader);
  return { useCase, testimonialRepository, orderReader, mediaUploader };
}

describe("SubmitTestimonialUseCase", () => {
  it("rejects a non-delivered order without ever calling create", async () => {
    const { useCase, testimonialRepository } = makeUseCase({ orderStatus: "SHIPPED" });

    await expect(
      useCase.execute({ customerId: "u1", orderId: "o1", rating: 5, text: "Loved it, arrived fast and beautifully packed!", images: [] }),
    ).rejects.toThrow(UnprocessableEntityError);
    expect(testimonialRepository.create).not.toHaveBeenCalled();
  });

  it("creates the testimonial for a delivered, owned order", async () => {
    const { useCase, testimonialRepository, orderReader } = makeUseCase();

    await useCase.execute({ customerId: "u1", orderId: "o1", rating: 5, text: "Loved it, arrived fast and beautifully packed!", images: [] });

    expect(orderReader.forCustomer).toHaveBeenCalledWith("o1", "u1");
    expect(testimonialRepository.create).toHaveBeenCalledWith({ orderId: "o1", customerId: "u1", rating: 5, text: "Loved it, arrived fast and beautifully packed!" });
  });

  it("rejects more than 3 images without creating a row", async () => {
    const { useCase, testimonialRepository } = makeUseCase();
    const images = Array.from({ length: 4 }, () => ({ buffer: Buffer.from("x"), originalFilename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 }));

    await expect(useCase.execute({ customerId: "u1", orderId: "o1", rating: 5, text: "Loved it, arrived fast and beautifully packed!", images })).rejects.toThrow(
      ValidationError,
    );
    expect(testimonialRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported image type without creating a row", async () => {
    const { useCase, testimonialRepository } = makeUseCase();
    const images = [{ buffer: Buffer.from("x"), originalFilename: "a.gif", mimeType: "image/gif", sizeBytes: 100 }];

    await expect(useCase.execute({ customerId: "u1", orderId: "o1", rating: 5, text: "Loved it, arrived fast and beautifully packed!", images })).rejects.toThrow(
      ValidationError,
    );
    expect(testimonialRepository.create).not.toHaveBeenCalled();
  });

  it("uploads each valid image and links it to the created testimonial", async () => {
    const { useCase, testimonialRepository, mediaUploader } = makeUseCase();
    const images = [
      { buffer: Buffer.from("x"), originalFilename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 },
      { buffer: Buffer.from("y"), originalFilename: "b.png", mimeType: "image/png", sizeBytes: 200 },
    ];

    await useCase.execute({ customerId: "u1", orderId: "o1", rating: 5, text: "Loved it, arrived fast and beautifully packed!", images });

    expect(mediaUploader.upload).toHaveBeenCalledTimes(2);
    expect(testimonialRepository.addImage).toHaveBeenCalledTimes(2);
    expect(testimonialRepository.addImage).toHaveBeenCalledWith("t1", "m1");
  });
});
