// Composition root for the banners module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): Banner. Homepage promotional carousel slides — admin-managed,
// ordered, optionally scheduled (2026-08-31 UI refinement pass). Public GET
// here; admin CRUD is exported below for the `admin` module's thin HTTP
// gateway to wire up, same pattern collections.module.ts already uses.
import { ListVisibleBannersUseCase } from "./application/use-cases/list-visible-banners.use-case";
import { ListBannersAdminUseCase } from "./application/use-cases/admin/list-banners-admin.use-case";
import { GetBannerAdminUseCase } from "./application/use-cases/admin/get-banner-admin.use-case";
import { CreateBannerUseCase } from "./application/use-cases/admin/create-banner.use-case";
import { UpdateBannerUseCase } from "./application/use-cases/admin/update-banner.use-case";
import { SetBannerActiveUseCase } from "./application/use-cases/admin/set-banner-active.use-case";
import { DeleteBannerUseCase } from "./application/use-cases/admin/delete-banner.use-case";
import { ReorderBannersUseCase } from "./application/use-cases/admin/reorder-banners.use-case";
import type { BannerRepositoryPort } from "./application/ports/banner-repository.port";
import { CachedBannerRepository } from "./infrastructure/repositories/cached-banner-repository";
import { BannerRepository } from "./infrastructure/repositories/banner.repository";
import { BannersController } from "./interface/http/banners.controller";
import { createBannersRouter } from "./interface/http/banners.routes";
import { env } from "../../config/env";

// ADR-017 (Caching Strategy) — see CachedBannerRepository's own doc comment
// for what's cached (findVisible only) vs. left live (every admin method).
// Skipped under `pnpm test` — see products.module.ts's own comment on this
// same pattern for why.
const realBannerRepository = new BannerRepository();
const bannerRepository: BannerRepositoryPort =
  env.NODE_ENV === "test" ? realBannerRepository : new CachedBannerRepository(realBannerRepository);

/** Exported for cross-module use — `home` composes this into its homepage payload (no extra request). */
export const listVisibleBannersUseCase = new ListVisibleBannersUseCase(bannerRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const listBannersAdminUseCase = new ListBannersAdminUseCase(bannerRepository);
export const getBannerAdminUseCase = new GetBannerAdminUseCase(bannerRepository);
export const createBannerUseCase = new CreateBannerUseCase(bannerRepository);
export const updateBannerUseCase = new UpdateBannerUseCase(bannerRepository);
export const setBannerActiveUseCase = new SetBannerActiveUseCase(bannerRepository);
export const deleteBannerUseCase = new DeleteBannerUseCase(bannerRepository);
export const reorderBannersUseCase = new ReorderBannersUseCase(bannerRepository);

const bannersController = new BannersController(listVisibleBannersUseCase);

export const router = createBannersRouter(bannersController);
