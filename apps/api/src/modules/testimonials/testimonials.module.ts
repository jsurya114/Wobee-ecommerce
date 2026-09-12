// Composition root for the testimonials module (ARCHITECTURE.md §3.2) —
// wires its own repo to its own use-cases to routes, and wires this
// module's ports to other modules' exported use-cases (orders, media,
// audit) as trivial pass-through adapters, same shape wishlist.module.ts/
// reviews.module.ts (removed 2026-09-11, replaced by this module) already
// used. Owns (ADR-010): Testimonial, TestimonialImage.
import { recordAuditLogUseCase } from "../audit/audit.module";
import { uploadMediaUseCase } from "../media/media.module";
import { getOrderUseCase } from "../orders/orders.module";
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import type { MediaUploaderPort } from "./application/ports/media-uploader.port";
import type { OrderReaderPort, TestimonialOrderView } from "./application/ports/order-reader.port";
import { ApproveTestimonialUseCase } from "./application/use-cases/admin/approve-testimonial.use-case";
import { ListTestimonialsForAdminUseCase } from "./application/use-cases/admin/list-testimonials-for-admin.use-case";
import { RejectTestimonialUseCase } from "./application/use-cases/admin/reject-testimonial.use-case";
import { GetAggregateTestimonialRatingUseCase } from "./application/use-cases/get-aggregate-rating.use-case";
import { GetMyTestimonialForOrderUseCase } from "./application/use-cases/get-my-testimonial-for-order.use-case";
import { ListApprovedTestimonialsUseCase } from "./application/use-cases/list-approved-testimonials.use-case";
import { SubmitTestimonialUseCase } from "./application/use-cases/submit-testimonial.use-case";
import { TestimonialRepository } from "./infrastructure/repositories/testimonial.repository";
import { TestimonialsController } from "./interface/http/testimonials.controller";
import { createTestimonialsRouter } from "./interface/http/testimonials.routes";

const testimonialRepository = new TestimonialRepository();

const orderReader: OrderReaderPort = {
  forCustomer: async (orderId, userId): Promise<TestimonialOrderView> => {
    const order = await getOrderUseCase.execute(orderId, userId);
    return { id: order.id, userId: order.userId, status: order.status, orderNumber: order.orderNumber };
  },
};
const mediaUploader: MediaUploaderPort = {
  upload: async (command, uploadedByUserId) => {
    const media = await uploadMediaUseCase.execute({ ...command, uploadedByUserId });
    return { id: media.id, url: media.url };
  },
};
const auditLogger: AuditLoggerPort = { log: (entry) => recordAuditLogUseCase.execute(entry) };

const submitTestimonialUseCase = new SubmitTestimonialUseCase(testimonialRepository, orderReader, mediaUploader);
const getMyTestimonialForOrderUseCase = new GetMyTestimonialForOrderUseCase(testimonialRepository);

/** Exported for `home`'s "Loved by Our Customers" rail (2026-09-11, replaces reviews'  listTopApprovedReviewsUseCase). */
export const listApprovedTestimonialsUseCase = new ListApprovedTestimonialsUseCase(testimonialRepository);
/** Exported for `home`'s aggregate store-rating display. */
export const getAggregateTestimonialRatingUseCase = new GetAggregateTestimonialRatingUseCase(testimonialRepository);

/** Exported for `admin`'s HTTP gateway (ADR-025), same pattern reviews' admin exports used. */
export const listTestimonialsForAdminUseCase = new ListTestimonialsForAdminUseCase(testimonialRepository);
export const approveTestimonialUseCase = new ApproveTestimonialUseCase(testimonialRepository, auditLogger);
export const rejectTestimonialUseCase = new RejectTestimonialUseCase(testimonialRepository, auditLogger);

const testimonialsController = new TestimonialsController(submitTestimonialUseCase, getMyTestimonialForOrderUseCase);

export const router = createTestimonialsRouter(testimonialsController);
