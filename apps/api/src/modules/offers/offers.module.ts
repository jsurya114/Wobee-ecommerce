// Composition root for the offers module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): Offer, OfferProduct.
//
// Phase 2 (2026-09-14). No HTTP surface of its own — same "leaf module"
// posture as `coupons` and `pricing`: `products` calls
// resolveApplicableOffersUseCase for PLP/PDP display, `cart` calls it for
// live cart recalculation, `orders` calls it inside checkout's own
// authoritative pricing pass, `home` calls listActiveOffersForStripUseCase
// for the homepage promo strip. Admin CRUD is exported for `admin`'s thin
// HTTP gateway (ADR-025), same pattern coupons/categories/banners already
// use — no controller/routes files in this module itself.
import { CreateOfferUseCase } from "./application/use-cases/admin/create-offer.use-case";
import { GetOfferAdminUseCase } from "./application/use-cases/admin/get-offer-admin.use-case";
import { ListOffersAdminUseCase } from "./application/use-cases/admin/list-offers-admin.use-case";
import { SetOfferActiveUseCase } from "./application/use-cases/admin/set-offer-active.use-case";
import { UpdateOfferUseCase } from "./application/use-cases/admin/update-offer.use-case";
import { ListActiveOffersForStripUseCase } from "./application/use-cases/list-active-offers-for-strip.use-case";
import { ResolveApplicableOffersUseCase } from "./application/use-cases/resolve-applicable-offers.use-case";
import { OfferRepository } from "./infrastructure/repositories/offer.repository";

const offerRepository = new OfferRepository();

/** Exported for cross-module use (products/cart/orders) — see this class's own doc comment. */
export const resolveApplicableOffersUseCase = new ResolveApplicableOffersUseCase(offerRepository);
/** Exported for `home`'s composed homepage payload — the promo strip. */
export const listActiveOffersForStripUseCase = new ListActiveOffersForStripUseCase(offerRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const listOffersAdminUseCase = new ListOffersAdminUseCase(offerRepository);
export const getOfferAdminUseCase = new GetOfferAdminUseCase(offerRepository);
export const createOfferUseCase = new CreateOfferUseCase(offerRepository);
export const updateOfferUseCase = new UpdateOfferUseCase(offerRepository);
export const setOfferActiveUseCase = new SetOfferActiveUseCase(offerRepository);
