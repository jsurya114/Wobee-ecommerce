import { Prisma, prisma } from "@woobe/database";
import { ConflictError } from "../../../../shared/errors";
import type {
  AdminListTestimonialsFilter,
  AdminListTestimonialsResult,
  AdminTestimonialRow,
  AggregateRating,
  CreateTestimonialFields,
  PublicTestimonialRow,
  TestimonialRepositoryPort,
  TransitionTestimonialStatusResult,
} from "../../application/ports/testimonial-repository.port";
import type { TestimonialEntity, TestimonialStatus } from "../../domain/entities/testimonial.entity";

const BASE_SELECT = {
  id: true,
  orderId: true,
  customerId: true,
  rating: true,
  text: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  images: { select: { id: true, media: { select: { url: true } } } },
} satisfies Prisma.TestimonialSelect;

type RawTestimonial = Prisma.TestimonialGetPayload<{ select: typeof BASE_SELECT }>;

function toEntity(row: RawTestimonial): TestimonialEntity {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId,
    rating: row.rating,
    text: row.text,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    images: row.images.map((image) => ({ id: image.id, url: image.media.url })),
  };
}

/** ADR-010: the ONLY file in the testimonials module allowed to import @woobe/database. */
export class TestimonialRepository implements TestimonialRepositoryPort {
  async create(fields: CreateTestimonialFields): Promise<TestimonialEntity> {
    try {
      const created = await prisma.testimonial.create({
        data: { orderId: fields.orderId, customerId: fields.customerId, rating: fields.rating, text: fields.text },
        select: BASE_SELECT,
      });
      return toEntity(created);
    } catch (error) {
      // P2002 on `orderId` — the schema's own @@unique constraint firing.
      // This, not a check-then-insert, is the authoritative guard against a
      // concurrent double-submit for the same order (same precedent as
      // ReviewRepository.create's own P2002 mapping for duplicate reviews).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("You've already shared your experience for this order");
      }
      throw error;
    }
  }

  async addImage(testimonialId: string, mediaId: string): Promise<void> {
    await prisma.testimonialImage.create({ data: { testimonialId, mediaId } });
  }

  async findByOrderIdForCustomer(customerId: string, orderId: string): Promise<TestimonialEntity | null> {
    // WHERE includes customerId, not just orderId — the authorization check
    // baked into the query itself (same posture as ReviewRepository's own
    // updateMany({where:{id,userId}}) pattern), not a separate check after
    // an unscoped fetch.
    const found = await prisma.testimonial.findFirst({ where: { orderId, customerId }, select: BASE_SELECT });
    return found ? toEntity(found) : null;
  }

  async findById(testimonialId: string): Promise<TestimonialEntity | null> {
    const found = await prisma.testimonial.findUnique({ where: { id: testimonialId }, select: BASE_SELECT });
    return found ? toEntity(found) : null;
  }

  async listApproved(limit: number): Promise<PublicTestimonialRow[]> {
    const rows = await prisma.testimonial.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { ...BASE_SELECT, customer: { select: { name: true } } },
    });
    return rows.map((row) => ({ ...toEntity(row), customerName: row.customer.name }));
  }

  async getApprovedAggregate(): Promise<AggregateRating> {
    const result = await prisma.testimonial.aggregate({
      where: { status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return { approvedCount: result._count._all, averageRating: result._avg.rating };
  }

  async listForAdmin(filter: AdminListTestimonialsFilter): Promise<AdminListTestimonialsResult> {
    const where: Prisma.TestimonialWhereInput = filter.status ? { status: filter.status } : {};
    const [rows, total] = await Promise.all([
      prisma.testimonial.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: { ...BASE_SELECT, customer: { select: { name: true, email: true } }, order: { select: { orderNumber: true } } },
      }),
      prisma.testimonial.count({ where }),
    ]);
    const items: AdminTestimonialRow[] = rows.map((row) => ({
      ...toEntity(row),
      customerName: row.customer.name,
      customerEmail: row.customer.email,
      orderNumber: row.order.orderNumber,
    }));
    return { items, total };
  }

  async transitionStatus(testimonialId: string, from: TestimonialStatus, to: TestimonialStatus): Promise<TransitionTestimonialStatusResult> {
    const { count } = await prisma.testimonial.updateMany({ where: { id: testimonialId, status: from }, data: { status: to } });
    const found = await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonialId }, select: BASE_SELECT });
    return { changed: count > 0, testimonial: toEntity(found) };
  }
}
