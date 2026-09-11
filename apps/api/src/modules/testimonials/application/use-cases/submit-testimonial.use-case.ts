import { UnprocessableEntityError, ValidationError } from "../../../../shared/errors";
import { MAX_TESTIMONIAL_IMAGES, validateTestimonialImage } from "../../domain/validate-testimonial-image";
import type { TestimonialEntity } from "../../domain/entities/testimonial.entity";
import type { ImageUploadCommand, MediaUploaderPort } from "../ports/media-uploader.port";
import type { OrderReaderPort } from "../ports/order-reader.port";
import type { TestimonialRepositoryPort } from "../ports/testimonial-repository.port";

export interface SubmitTestimonialCommand {
  customerId: string;
  orderId: string;
  rating: number;
  text: string;
  images: ImageUploadCommand[];
}

/**
 * The one write path for the whole testimonial submission — rating, text,
 * AND up to `MAX_TESTIMONIAL_IMAGES` photos all land in this single call
 * (multipart/form-data, not a create-then-separately-upload-photos dance).
 * That's a deliberate design choice, not just convenience: "Photo
 * Editability" (2026-09-11 design) requires that a submitted testimonial
 * can never be edited afterward — collapsing submission into one atomic
 * use-case means there's no window between "row exists" and "photos
 * attached" in which a second request could append/replace anything.
 *
 * Eligibility: DELIVERED orders only (never coupled to the separate 7-day
 * return window — a different business rule entirely), and ownership is
 * enforced by `orderReader.forCustomer` throwing NotFoundError for both
 * "doesn't exist" and "isn't yours" (never distinguishable — see that
 * port's own doc comment). The one-testimonial-per-order guarantee is the
 * schema's own `orderId @unique` constraint, not a check-then-insert here
 * — `testimonialRepository.create` is what a concurrent double-submit
 * actually races against; see TestimonialRepository.create's own comment
 * for the P2002 mapping.
 */
export class SubmitTestimonialUseCase {
  constructor(
    private readonly testimonialRepository: TestimonialRepositoryPort,
    private readonly orderReader: OrderReaderPort,
    private readonly mediaUploader: MediaUploaderPort,
  ) {}

  async execute(command: SubmitTestimonialCommand): Promise<TestimonialEntity> {
    const order = await this.orderReader.forCustomer(command.orderId, command.customerId);
    if (order.status !== "DELIVERED") {
      throw new UnprocessableEntityError("Only delivered orders are eligible for a testimonial");
    }

    if (command.images.length > MAX_TESTIMONIAL_IMAGES) {
      throw new ValidationError(`You can attach at most ${MAX_TESTIMONIAL_IMAGES} photos`);
    }
    for (const image of command.images) {
      const validation = validateTestimonialImage(image.mimeType, image.sizeBytes);
      if (!validation.ok) {
        throw new ValidationError(validation.error!);
      }
    }

    const testimonial = await this.testimonialRepository.create({
      orderId: command.orderId,
      customerId: command.customerId,
      rating: command.rating,
      text: command.text,
    });

    for (const image of command.images) {
      const uploaded = await this.mediaUploader.upload(image, command.customerId);
      await this.testimonialRepository.addImage(testimonial.id, uploaded.id);
    }

    return command.images.length === 0 ? testimonial : ((await this.testimonialRepository.findById(testimonial.id)) ?? testimonial);
  }
}
