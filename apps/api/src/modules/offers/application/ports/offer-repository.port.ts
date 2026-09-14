import type { OfferDiscountType, OfferScope } from "@woobe/types";
import type { OfferEntity, OfferForResolution, OfferStripEntity } from "../../domain/entities/offer.entity";

export interface CreateOfferData {
  name: string;
  description: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  /** Non-empty only for PRODUCTS scope — validated by CreateOfferUseCase before this is called. */
  productIds: string[];
  priority: number;
  startsAt: Date;
  endsAt: Date;
}

export type UpdateOfferData = Partial<CreateOfferData>;

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1).
 */
export interface OfferRepositoryPort {
  /**
   * Every offer that is currently `isActive` AND in its `[startsAt, endsAt)`
   * schedule window, in the lean `OfferForResolution` shape — ONE query
   * regardless of how many products are being priced (see
   * ResolveApplicableOffersUseCase's own doc comment on why this must never
   * become a per-product query). The `now` filter happens at the DB level
   * (repository), not just in `isOfferActive` — see that function's own
   * doc comment for why both exist: the pure function is what a unit test
   * asserts the query's WHERE clause against.
   */
  findActiveForResolution(now: Date): Promise<OfferForResolution[]>;
  /** Same live-schedule filter, lighter shape — the homepage offer strip. */
  findActiveForStrip(now: Date): Promise<OfferStripEntity[]>;

  // ── Admin offer management ──
  findAllForAdmin(): Promise<OfferEntity[]>;
  findByIdForAdmin(id: string): Promise<OfferEntity | null>;
  createOffer(data: CreateOfferData): Promise<OfferEntity>;
  updateOffer(id: string, data: UpdateOfferData): Promise<OfferEntity>;
  setActive(id: string, isActive: boolean): Promise<OfferEntity>;
}
